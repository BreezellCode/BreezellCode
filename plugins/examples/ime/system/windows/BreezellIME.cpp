// Breezell IME for Windows: the text service (a TSF text input processor) every program loads.
//
// It holds no language logic. Each key goes over a named pipe to the Breezell IME host (the
// engine, run by Breezell's own runtime); the host answers whether it takes the key, what to
// commit, what is being composed and the candidates. This DLL puts the composition in the
// program's text, draws the candidate panel under it, switches native / English on a lone
// Shift, and starts the host when it is not running. In Breezell's own editor and chat the host
// tells it to step aside: Breezell's input method takes those keys itself.
//
// Profiles: 繁體中文 0404, 简体中文 0804, 日本語 0411, 한국어 0412 (the host picks the layout).
//
// Newer builds without restarting programs: the registered DLL (Program Files) hands the work to
// the newest build published under %LOCALAPPDATA%\BreezellIME\tip\<version> (HKCU\Software\
// BreezellIME TipVersion), and swaps to a newer one as soon as it appears, between keys. Elevated
// and sandboxed programs only take builds an administrator put under Program Files.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <msctf.h>
#include <ctffunc.h>
#include <olectl.h>
#include <strsafe.h>
#include <d2d1.h>
#include <dwrite.h>
#include <dwmapi.h>
#include <algorithm>
#include <cstdarg>
#include <cstdio>
#include <cmath>
#include <functional>
#include <string>
#include <vector>

// This build's version: a newer one published under the tip folder replaces it in running programs.
#ifndef TIP_VERSION
#define TIP_VERSION 7
#endif
#define WIDE2(x) L##x
#define WIDE(x) WIDE2(x)
#define STR2(x) #x
#define STR(x) STR2(x)

// {124D7B5B-968F-4E0E-BA91-98F4F77D1EB9}
static const CLSID CLSID_BreezellIME = { 0x124d7b5b, 0x968f, 0x4e0e, { 0xba, 0x91, 0x98, 0xf4, 0xf7, 0x7d, 0x1e, 0xb9 } };
static const GUID GUID_PROFILE_ZHTW = { 0xcd0ed061, 0xc951, 0x4941, { 0xbb, 0x08, 0x98, 0x81, 0x8c, 0xe2, 0x4e, 0xb3 } };
static const GUID GUID_PROFILE_ZHCN = { 0xac5c0798, 0xcc51, 0x4140, { 0xaf, 0x5d, 0x43, 0x28, 0xbf, 0x11, 0x7d, 0x6b } };
static const GUID GUID_PROFILE_JA = { 0x3865af80, 0xc7d2, 0x4f3c, { 0xaa, 0x5a, 0x40, 0x6a, 0x26, 0xbe, 0x98, 0xda } };
static const GUID GUID_PROFILE_KO = { 0xcd2c7bcc, 0x59d5, 0x4d3d, { 0x8a, 0x25, 0x1d, 0xd5, 0x8b, 0x93, 0xdd, 0x4e } };
// Category GUIDs (msctf.h declares them; defined here so no extra library is needed).
static const GUID CAT_TIP_KEYBOARD = { 0x34745c63, 0xb2f0, 0x4784, { 0x8b, 0x67, 0x5e, 0x12, 0xc8, 0x70, 0x1a, 0x31 } };
static const GUID CAT_IMMERSIVE = { 0x13a016df, 0x560b, 0x46cd, { 0x94, 0x7a, 0x4c, 0x3a, 0xf1, 0xe0, 0xe3, 0x5d } };
static const GUID CAT_SYSTRAY = { 0x25504fb4, 0x7bab, 0x4bc1, { 0x9c, 0x69, 0xcf, 0x81, 0x89, 0x0f, 0x0e, 0xf5 } };
// The lone Shift, kept by the system's keystroke manager for us (on key up; with and without the
// Shift flag, as programs report it either way: the second of a pair in one press is ignored).
static const GUID GUID_PRESERVE_SHIFT = { 0xd8fd077a, 0x7156, 0x4120, { 0x9c, 0xae, 0xf4, 0x09, 0x2c, 0x57, 0x20, 0xcb } };
static const GUID GUID_PRESERVE_SHIFT_FLAG = { 0x450e424c, 0xe873, 0x4183, { 0xaf, 0x17, 0x86, 0x88, 0x9d, 0xcb, 0x2e, 0x0a } };

static HINSTANCE g_hInst = nullptr;
static LONG g_dllRefs = 0;

struct Profile { LANGID lang; const GUID* guid; const wchar_t* name; };
static const Profile PROFILES[] = {
	{ 0x0404, &GUID_PROFILE_ZHTW, L"Breezell 輸入法" },
	{ 0x0804, &GUID_PROFILE_ZHCN, L"Breezell 输入法" },
	{ 0x0411, &GUID_PROFILE_JA, L"Breezell IME" },
	{ 0x0412, &GUID_PROFILE_KO, L"Breezell 입력기" },
};

/** BREEZELL_IME_TRACE=<file>: a line per step of the text service's own workings (diagnosis). */
static void Trace(const char* fmt, ...) {
	static int on = -1;
	static wchar_t path[MAX_PATH];
	if (on < 0) on = GetEnvironmentVariableW(L"BREEZELL_IME_TRACE", path, MAX_PATH) ? 1 : 0;
	if (!on) return;
	char line[512];
	va_list args;
	va_start(args, fmt);
	int n = _vsnprintf_s(line, sizeof line - 2, _TRUNCATE, fmt, args);
	va_end(args);
	if (n < 0) n = (int)strlen(line);
	line[n++] = '\n';
	HANDLE h = CreateFileW(path, FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, OPEN_ALWAYS, 0, nullptr);
	if (h == INVALID_HANDLE_VALUE) return;
	DWORD w = 0;
	WriteFile(h, line, (DWORD)n, &w, nullptr);
	CloseHandle(h);
}

static void DllAddRef() { InterlockedIncrement(&g_dllRefs); }
static void DllRelease() { InterlockedDecrement(&g_dllRefs); }

// ---------------------------------------------------------------- text helpers

static std::string ToUtf8(const std::wstring& w) {
	if (w.empty()) return std::string();
	int n = WideCharToMultiByte(CP_UTF8, 0, w.data(), (int)w.size(), nullptr, 0, nullptr, nullptr);
	std::string s(n, '\0');
	WideCharToMultiByte(CP_UTF8, 0, w.data(), (int)w.size(), &s[0], n, nullptr, nullptr);
	return s;
}

static std::wstring FromUtf8(const std::string& s) {
	if (s.empty()) return std::wstring();
	int n = MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), nullptr, 0);
	std::wstring w(n, L'\0');
	MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), &w[0], n);
	return w;
}

static std::vector<std::string> Split(const std::string& s, char sep) {
	std::vector<std::string> out;
	size_t start = 0;
	for (;;) {
		size_t i = s.find(sep, start);
		if (i == std::string::npos) { out.push_back(s.substr(start)); break; }
		out.push_back(s.substr(start, i - start));
		start = i + 1;
	}
	return out;
}

// ---------------------------------------------------------------- the host

/** What the host answered to a key. */
struct ImeState {
	bool eaten = false;
	bool composing = false;
	bool english = false;
	int highlight = 0;
	bool shiftLabels = false;
	/** No numbers beside the candidates: no digit picks them (the words offered after a commit). */
	bool noLabels = false;
	bool more = false;
	/** There is a page before this one. */
	bool prev = false;
	/** The key went to Breezell's own input method: show nothing. */
	bool quiet = false;
	std::wstring commit, preedit;
	/** The panel's top line (hen jian dan) and the input method's sign (中 · 繁). */
	std::wstring reading, badge;
	std::vector<std::wstring> candidates;
};

static bool ParseState(const std::string& line, ImeState& s) {
	std::vector<std::string> f = Split(line, '\t');
	if (f.size() < 10 || f[0] != "S") return false;
	s.eaten = f[1] == "1";
	s.composing = f[2] == "1";
	s.english = f[3] == "e";
	s.highlight = atoi(f[4].c_str());
	s.shiftLabels = f[5] == "s";
	s.noLabels = f[5] == "n";
	s.more = f[6] == "1";
	s.commit = FromUtf8(f[7]);
	s.preedit = FromUtf8(f[8]);
	s.candidates.clear();
	if (!f[9].empty()) {
		for (const std::string& c : Split(f[9], '\x1e')) s.candidates.push_back(FromUtf8(c));
	}
	// Fields an older host does not send.
	s.reading = f.size() > 10 ? FromUtf8(f[10]) : std::wstring();
	s.prev = f.size() > 11 && f[11] == "1";
	s.badge = f.size() > 12 ? FromUtf8(f[12]) : std::wstring();
	s.quiet = f.size() > 13 && f[13] == "1";
	return true;
}

/** Whether this program may start the host: not sandboxed (AppContainer), not elevated. */
static bool MayStartHost() {
	HANDLE token = nullptr;
	if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) return false;
	DWORD len = 0, appContainer = 0;
	TOKEN_ELEVATION elevation = {};
	GetTokenInformation(token, TokenIsAppContainer, &appContainer, sizeof appContainer, &len);
	GetTokenInformation(token, TokenElevation, &elevation, sizeof elevation, &len);
	CloseHandle(token);
	return !appContainer && !elevation.TokenIsElevated;
}

static std::wstring RegString(const wchar_t* name) {
	wchar_t buf[MAX_PATH * 2] = {};
	DWORD size = sizeof buf;
	if (RegGetValueW(HKEY_CURRENT_USER, L"Software\\BreezellIME", name, RRF_RT_REG_SZ, nullptr, buf, &size) != ERROR_SUCCESS) return std::wstring();
	return buf;
}

/** One connection to the host, one line each way, never waiting long: a stuck host must not stall the program. */
class HostPipe {
	HANDLE _h = INVALID_HANDLE_VALUE;
	std::wstring _name;
	std::string _pending;
	ULONGLONG _nextLaunch = 0;

	/** `wait`: when every pipe instance is busy, wait a moment for one (not when just switched on: never stall a program). */
	bool Open(bool wait = true) {
		_h = CreateFileW(_name.c_str(), GENERIC_READ | GENERIC_WRITE, 0, nullptr, OPEN_EXISTING, FILE_FLAG_OVERLAPPED, nullptr);
		if (wait && _h == INVALID_HANDLE_VALUE && GetLastError() == ERROR_PIPE_BUSY && WaitNamedPipeW(_name.c_str(), 300)) {
			_h = CreateFileW(_name.c_str(), GENERIC_READ | GENERIC_WRITE, 0, nullptr, OPEN_EXISTING, FILE_FLAG_OVERLAPPED, nullptr);
		}
		_pending.clear();
		return _h != INVALID_HANDLE_VALUE;
	}

	/** Starts the host: HKCU\Software\BreezellIME HostExe (Breezell.exe) runs HostScript as Node. */
	bool Launch() {
		ULONGLONG now = GetTickCount64();
		if (now < _nextLaunch || !MayStartHost()) return false;
		_nextLaunch = now + 60000;
		std::wstring exe = RegString(L"HostExe"), script = RegString(L"HostScript");
		if (exe.empty() || script.empty()) return false;
		std::wstring cmd = L"\"" + exe + L"\" \"" + script + L"\"";
		// The environment without what an Electron program (Breezell, VS Code) leaves in it, plus run-as-Node.
		std::wstring env;
		if (LPWCH block = GetEnvironmentStringsW()) {
			for (LPWCH p = block; *p; p += wcslen(p) + 1) {
				if (_wcsnicmp(p, L"ELECTRON_", 9) == 0 || _wcsnicmp(p, L"VSCODE_", 7) == 0 || _wcsnicmp(p, L"NODE_OPTIONS=", 13) == 0 || _wcsnicmp(p, L"CHROME_CRASHPAD", 15) == 0) continue;
				env.append(p);
				env.push_back(L'\0');
			}
			FreeEnvironmentStringsW(block);
		}
		env.append(L"ELECTRON_RUN_AS_NODE=1");
		env.push_back(L'\0');
		env.push_back(L'\0');
		STARTUPINFOW si = { sizeof si };
		PROCESS_INFORMATION pi = {};
		DWORD flags = CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT | CREATE_NEW_PROCESS_GROUP;
		BOOL ok = CreateProcessW(exe.c_str(), &cmd[0], nullptr, nullptr, FALSE, flags | CREATE_BREAKAWAY_FROM_JOB, &env[0], nullptr, &si, &pi);
		if (!ok) ok = CreateProcessW(exe.c_str(), &cmd[0], nullptr, nullptr, FALSE, flags, &env[0], nullptr, &si, &pi);
		if (!ok) return false;
		CloseHandle(pi.hThread);
		CloseHandle(pi.hProcess);
		return true;
	}

public:
	HostPipe() {
		wchar_t user[256] = {};
		DWORD n = 256;
		GetUserNameW(user, &n);
		_name = std::wstring(L"\\\\.\\pipe\\breezell-ime-") + user;
	}
	~HostPipe() { Close(); }

	bool Connected() const { return _h != INVALID_HANDLE_VALUE; }

	/** Connects only if the host is running (never starts it, never waits for it). */
	bool ConnectIfRunning() { return Connected() || Open(false); }

	void Close() {
		if (_h != INVALID_HANDLE_VALUE) { CloseHandle(_h); _h = INVALID_HANDLE_VALUE; }
		_pending.clear();
	}

	/** Connects, starting the host when it is not there (then waits for it up to ~4 s, once a minute at most). */
	bool Connect() {
		if (Connected()) return true;
		if (Open()) return true;
		if (!Launch()) return false;
		for (int i = 0; i < 40; i++) {
			Sleep(100);
			if (Open()) return true;
		}
		return false;
	}

	bool Request(const std::string& line, std::string& reply, DWORD timeoutMs) {
		if (!Connected()) return false;
		std::string out = line + "\n";
		OVERLAPPED ov = {};
		ov.hEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
		if (!ov.hEvent) return false;
		bool ok = false;
		DWORD n = 0;
		ULONGLONG deadline = GetTickCount64() + timeoutMs;
		auto wait = [&](BOOL started) -> bool {
			if (!started && GetLastError() != ERROR_IO_PENDING) return false;
			ULONGLONG now = GetTickCount64();
			DWORD left = now >= deadline ? 0 : (DWORD)(deadline - now);
			if (WaitForSingleObject(ov.hEvent, left) != WAIT_OBJECT_0) {
				CancelIoEx(_h, &ov);
				GetOverlappedResult(_h, &ov, &n, TRUE);
				return false;
			}
			return GetOverlappedResult(_h, &ov, &n, FALSE) != FALSE;
		};
		if (wait(WriteFile(_h, out.data(), (DWORD)out.size(), nullptr, &ov)) && n == out.size()) {
			char buf[4096];
			for (;;) {
				size_t nl = _pending.find('\n');
				if (nl != std::string::npos) {
					reply = _pending.substr(0, nl);
					if (!reply.empty() && reply.back() == '\r') reply.pop_back();
					_pending.erase(0, nl + 1);
					ok = true;
					break;
				}
				ResetEvent(ov.hEvent);
				n = 0;
				if (!wait(ReadFile(_h, buf, sizeof buf, nullptr, &ov)) || n == 0) break;
				_pending.append(buf, n);
			}
		}
		CloseHandle(ov.hEvent);
		if (!ok) Close();
		return ok;
	}
};

// ---------------------------------------------------------------- the candidate panel

class TextService;

// The panel looks the same as Breezell's own (its editor and chat draw it too): the reading on
// top with the input method's sign at the right, the candidates in a row under it, the
// highlighted one on a tinted pill, ‹ › to turn pages. Colours are Breezell Dark's and Breezell
// Light's widget colours, picked by the system's app theme.
namespace Look {
	const float padX = 10, padY = 7, rowGap = 4, itemPadX = 7, itemPadY = 3, itemGap = 2, labelGap = 4, radius = 6, pagerW = 18, badgeGap = 18;
	const float textSize = 16, labelSize = 12, readingSize = 13, badgeSize = 12, flashSize = 16, flashPadX = 12, flashPadY = 6;
}

struct Palette { D2D1_COLOR_F bg, border, fg, muted, accent, pill, hover; COLORREF borderRef; };

static D2D1_COLOR_F Rgb(UINT32 rgb, float a = 1.f) {
	return D2D1::ColorF(((rgb >> 16) & 0xff) / 255.f, ((rgb >> 8) & 0xff) / 255.f, (rgb & 0xff) / 255.f, a);
}

static bool SystemUsesDark() {
	DWORD v = 1, size = sizeof v;
	if (RegGetValueW(HKEY_CURRENT_USER, L"Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize", L"AppsUseLightTheme", RRF_RT_REG_DWORD, nullptr, &v, &size) != ERROR_SUCCESS) return false;
	return v == 0;
}

static Palette PaletteFor(bool dark) {
	if (dark) return { Rgb(0x1F1F1F), Rgb(0x3A3A3A), Rgb(0xE4E4E4), Rgb(0x9A9A9A), Rgb(0x89B4FA), Rgb(0x89B4FA, 0.22f), Rgb(0xFFFFFF, 0.07f), RGB(0x3A, 0x3A, 0x3A) };
	return { Rgb(0xFFFFFF), Rgb(0xD6D6D6), Rgb(0x393A34), Rgb(0x8A8A85), Rgb(0x1E66F5), Rgb(0x1E66F5, 0.12f), Rgb(0x000000, 0.05f), RGB(0xD6, 0xD6, 0xD6) };
}

/** The font for a profile's language (DirectWrite falls back per character from it). */
static const wchar_t* FamilyFor(LANGID lang, const wchar_t** locale) {
	switch (lang) {
	case 0x0411: *locale = L"ja-JP"; return L"Yu Gothic UI";
	case 0x0412: *locale = L"ko-KR"; return L"Malgun Gothic";
	case 0x0804: *locale = L"zh-CN"; return L"Microsoft YaHei UI";
	default: *locale = L"zh-TW"; return L"Microsoft JhengHei UI";
	}
}

static ID2D1Factory* g_d2d = nullptr;
static IDWriteFactory* g_dwrite = nullptr;

static bool EnsureFactories() {
	if (!g_d2d && FAILED(D2D1CreateFactory(D2D1_FACTORY_TYPE_SINGLE_THREADED, &g_d2d))) return false;
	if (!g_dwrite && FAILED(DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED, __uuidof(IDWriteFactory), reinterpret_cast<IUnknown**>(&g_dwrite)))) return false;
	return true;
}

/** The window's DPI (GetDpiForWindow where the system has it, else the screen's). */
static UINT DpiOf(HWND hwnd) {
	typedef UINT(WINAPI * GetDpiForWindowFn)(HWND);
	static GetDpiForWindowFn fn = reinterpret_cast<GetDpiForWindowFn>(GetProcAddress(GetModuleHandleW(L"user32.dll"), "GetDpiForWindow"));
	if (fn && hwnd) {
		UINT d = fn(hwnd);
		if (d) return d;
	}
	UINT dpi = 96;
	HDC screen = GetDC(nullptr);
	if (screen) { dpi = GetDeviceCaps(screen, LOGPIXELSY); ReleaseDC(nullptr, screen); }
	return dpi;
}

/** Candidates in a row under the composition; a click picks one, ‹ › turn pages. Also the brief 中 / 英 sign. */
class CandidateWindow {
	HWND _hwnd = nullptr;
	ImeState _state;
	std::wstring _flash;
	LANGID _lang = 0x0404, _formatsLang = 0;
	TextService* _owner;
	bool _dark = false, _dwmRound = false;
	float _scale = 1.f;
	D2D1_SIZE_F _size = {};
	ID2D1DCRenderTarget* _target = nullptr;
	IDWriteTextFormat *_textFormat = nullptr, *_labelFormat = nullptr, *_readingFormat = nullptr, *_badgeFormat = nullptr, *_flashFormat = nullptr;

	struct Item { D2D1_RECT_F box = {}; IDWriteTextLayout* label = nullptr; IDWriteTextLayout* text = nullptr; float labelBaseline = 0, textBaseline = 0; };
	std::vector<Item> _items;
	IDWriteTextLayout *_reading = nullptr, *_badge = nullptr, *_flashText = nullptr, *_prevText = nullptr, *_nextText = nullptr;
	float _topY = 0, _topH = 0, _readingH = 0, _badgeW = 0, _badgeH = 0, _rowH = 0;
	D2D1_RECT_F _prevBox = {}, _nextBox = {};
	bool _pager = false;
	/** Under the mouse: an item's index, kPrev, kNext, or -1. */
	int _hover = -1;
	bool _tracking = false;
	static const int kPrev = -2, kNext = -3;

	// One class per build: an older build may still be loaded in the program.
	static const wchar_t* ClassName() { return L"BreezellIMECandidateWindow" WIDE(STR(TIP_VERSION)); }

	static LRESULT CALLBACK Proc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp);

	template <class T> static void Drop(T*& p) { if (p) { p->Release(); p = nullptr; } }

	void DropLayouts() {
		for (Item& it : _items) { Drop(it.label); Drop(it.text); }
		_items.clear();
		Drop(_reading); Drop(_badge); Drop(_flashText); Drop(_prevText); Drop(_nextText);
	}

	void DropFormats() {
		Drop(_textFormat); Drop(_labelFormat); Drop(_readingFormat); Drop(_badgeFormat); Drop(_flashFormat);
		_formatsLang = 0;
	}

	void EnsureWindow() {
		if (_hwnd) return;
		static LONG registered = 0;
		if (InterlockedCompareExchange(&registered, 1, 0) == 0) {
			WNDCLASSEXW wc = { sizeof wc };
			wc.style = CS_DROPSHADOW | CS_IME;
			wc.lpfnWndProc = Proc;
			wc.hInstance = g_hInst;
			wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
			wc.lpszClassName = ClassName();
			RegisterClassExW(&wc);
		}
		_hwnd = CreateWindowExW(WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE, ClassName(), L"", WS_POPUP, 0, 0, 1, 1, nullptr, nullptr, g_hInst, this);
		if (_hwnd) {
			// Windows 11 rounds it and draws its border; elsewhere the panel draws its own.
			DWORD round = 2;  // DWMWCP_ROUND
			_dwmRound = SUCCEEDED(DwmSetWindowAttribute(_hwnd, 33 /* DWMWA_WINDOW_CORNER_PREFERENCE */, &round, sizeof round));
		}
	}

	bool EnsureFormats() {
		if (!EnsureFactories()) return false;
		if (_formatsLang == _lang && _textFormat) return true;
		DropFormats();
		const wchar_t* locale = L"zh-TW";
		const wchar_t* family = FamilyFor(_lang, &locale);
		auto make = [&](const wchar_t* fam, float size, IDWriteTextFormat** out) {
			if (SUCCEEDED(g_dwrite->CreateTextFormat(fam, nullptr, DWRITE_FONT_WEIGHT_NORMAL, DWRITE_FONT_STYLE_NORMAL, DWRITE_FONT_STRETCH_NORMAL, size, locale, out))) {
				(*out)->SetWordWrapping(DWRITE_WORD_WRAPPING_NO_WRAP);
			}
		};
		make(family, Look::textSize, &_textFormat);
		make(L"Segoe UI", Look::labelSize, &_labelFormat);
		make(family, Look::readingSize, &_readingFormat);
		make(family, Look::badgeSize, &_badgeFormat);
		make(family, Look::flashSize, &_flashFormat);
		_formatsLang = _lang;
		return _textFormat && _labelFormat && _readingFormat && _badgeFormat && _flashFormat;
	}

	IDWriteTextLayout* MakeLayout(IDWriteTextFormat* f, const std::wstring& s) {
		IDWriteTextLayout* l = nullptr;
		g_dwrite->CreateTextLayout(s.c_str(), (UINT32)s.size(), f, 4000.f, 400.f, &l);
		return l;
	}

	static DWRITE_TEXT_METRICS Measure(IDWriteTextLayout* l) {
		DWRITE_TEXT_METRICS m = {};
		if (l) l->GetMetrics(&m);
		return m;
	}

	static float Baseline(IDWriteTextLayout* l) {
		DWRITE_LINE_METRICS lm[2] = {};
		UINT32 n = 0;
		if (l && SUCCEEDED(l->GetLineMetrics(lm, 2, &n)) && n) return lm[0].baseline;
		return 0;
	}

	std::wstring Label(size_t i) const {
		if (_state.noLabels) return std::wstring();
		wchar_t b[8];
		StringCchPrintfW(b, 8, _state.shiftLabels ? L"⇧%u" : L"%u", (unsigned)(i + 1));
		return b;
	}

	/** Lays the panel out in DIPs; returns its size in pixels. */
	SIZE Layout() {
		using namespace Look;
		DropLayouts();
		if (!EnsureFormats()) return { 1, 1 };
		if (!_flash.empty()) {
			_flashText = MakeLayout(_flashFormat, _flash);
			DWRITE_TEXT_METRICS m = Measure(_flashText);
			_size = D2D1::SizeF(m.widthIncludingTrailingWhitespace + 2 * flashPadX, m.height + 2 * flashPadY);
		} else {
			float y = padY, topW = 0;
			std::wstring reading = !_state.reading.empty() ? _state.reading : _state.preedit;
			_topH = 0;
			if (!reading.empty() || !_state.badge.empty()) {
				float readingW = 0;
				if (!reading.empty()) {
					_reading = MakeLayout(_readingFormat, reading);
					DWRITE_TEXT_METRICS m = Measure(_reading);
					readingW = m.widthIncludingTrailingWhitespace;
					_readingH = m.height;
				}
				_badgeW = _badgeH = 0;
				if (!_state.badge.empty()) {
					_badge = MakeLayout(_badgeFormat, _state.badge);
					DWRITE_TEXT_METRICS m = Measure(_badge);
					_badgeW = m.widthIncludingTrailingWhitespace;
					_badgeH = m.height;
				}
				_topY = y;
				_topH = std::max(_readingH, _badgeH);
				topW = readingW + (_badgeW > 0 ? badgeGap + _badgeW : 0);
				y += _topH + rowGap;
			}
			// The pills reach into the padding, so the candidates' text lines up with the reading.
			float x = padX - itemPadX;
			_rowH = 0;
			for (size_t i = 0; i < _state.candidates.size(); i++) {
				Item it;
				it.label = MakeLayout(_labelFormat, Label(i));
				it.text = MakeLayout(_textFormat, _state.candidates[i]);
				DWRITE_TEXT_METRICS lm = Measure(it.label), tm = Measure(it.text);
				it.labelBaseline = Baseline(it.label);
				it.textBaseline = Baseline(it.text);
				float w = itemPadX + lm.widthIncludingTrailingWhitespace + (_state.noLabels ? 0 : labelGap) + tm.widthIncludingTrailingWhitespace + itemPadX;
				_rowH = std::max(_rowH, tm.height + 2 * itemPadY);
				it.box = D2D1::RectF(x, y, x + w, y);
				x += w + itemGap;
				_items.push_back(it);
			}
			for (Item& it : _items) it.box.bottom = it.box.top + _rowH;
			float rowRight = _items.empty() ? padX : _items.back().box.right;
			_pager = _state.more || _state.prev;
			if (_pager) {
				_prevText = MakeLayout(_textFormat, L"‹");
				_nextText = MakeLayout(_textFormat, L"›");
				float px = rowRight + 4;
				_prevBox = D2D1::RectF(px, y, px + pagerW, y + _rowH);
				_nextBox = D2D1::RectF(px + pagerW, y, px + 2 * pagerW, y + _rowH);
				rowRight = _nextBox.right;
			}
			float width = std::max(rowRight + (padX - itemPadX), padX + topW + padX);
			_size = D2D1::SizeF(width, y + _rowH + padY - itemPadY);
		}
		return { (LONG)ceilf(_size.width * _scale), (LONG)ceilf(_size.height * _scale) };
	}

	void Paint(HDC dc, const RECT& rc) {
		if (!EnsureFactories()) return;
		if (!_target) {
			D2D1_RENDER_TARGET_PROPERTIES props = D2D1::RenderTargetProperties(D2D1_RENDER_TARGET_TYPE_DEFAULT, D2D1::PixelFormat(DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_IGNORE));
			if (FAILED(g_d2d->CreateDCRenderTarget(&props, &_target))) return;
		}
		if (FAILED(_target->BindDC(dc, &rc))) return;
		_target->SetDpi(96.f * _scale, 96.f * _scale);
		_target->SetTextAntialiasMode(D2D1_TEXT_ANTIALIAS_MODE_CLEARTYPE);
		const Palette p = PaletteFor(_dark);
		_target->BeginDraw();
		_target->Clear(p.bg);
		ID2D1SolidColorBrush* brush = nullptr;
		if (SUCCEEDED(_target->CreateSolidColorBrush(p.fg, &brush))) {
			using namespace Look;
			if (!_dwmRound) {
				const float px = 1.f / _scale;
				brush->SetColor(p.border);
				_target->DrawRectangle(D2D1::RectF(px / 2, px / 2, _size.width - px / 2, _size.height - px / 2), brush, px);
			}
			if (_flashText) {
				brush->SetColor(p.fg);
				_target->DrawTextLayout(D2D1::Point2F(flashPadX, flashPadY), _flashText, brush);
			} else {
				if (_reading) {
					brush->SetColor(p.muted);
					_target->DrawTextLayout(D2D1::Point2F(padX, _topY + (_topH - _readingH) / 2), _reading, brush);
				}
				if (_badge) {
					brush->SetColor(p.muted);
					_target->DrawTextLayout(D2D1::Point2F(_size.width - padX - _badgeW, _topY + (_topH - _badgeH) / 2), _badge, brush);
				}
				for (size_t i = 0; i < _items.size(); i++) {
					const Item& it = _items[i];
					const bool hl = (int)i == _state.highlight;
					if (hl || (int)i == _hover) {
						brush->SetColor(hl ? p.pill : p.hover);
						_target->FillRoundedRectangle(D2D1::RoundedRect(it.box, radius, radius), brush);
					}
					const float textTop = it.box.top + itemPadY;
					brush->SetColor(hl ? p.accent : p.muted);
					_target->DrawTextLayout(D2D1::Point2F(it.box.left + itemPadX, textTop + it.textBaseline - it.labelBaseline), it.label, brush);
					DWRITE_TEXT_METRICS lm = Measure(it.label);
					brush->SetColor(p.fg);
					_target->DrawTextLayout(D2D1::Point2F(it.box.left + itemPadX + lm.widthIncludingTrailingWhitespace + (_state.noLabels ? 0 : labelGap), textTop), it.text, brush);
				}
				if (_pager) {
					auto arrow = [&](IDWriteTextLayout* l, const D2D1_RECT_F& box, bool on, bool hover) {
						if (on && hover) {
							brush->SetColor(p.hover);
							_target->FillRoundedRectangle(D2D1::RoundedRect(box, radius, radius), brush);
						}
						D2D1_COLOR_F c = p.muted;
						if (!on) c.a = 0.35f;
						brush->SetColor(c);
						DWRITE_TEXT_METRICS m = Measure(l);
						_target->DrawTextLayout(D2D1::Point2F(box.left + (box.right - box.left - m.widthIncludingTrailingWhitespace) / 2, box.top + itemPadY), l, brush);
					};
					arrow(_prevText, _prevBox, _state.prev, _hover == kPrev);
					arrow(_nextText, _nextBox, _state.more, _hover == kNext);
				}
			}
			brush->Release();
		}
		if (_target->EndDraw() == D2DERR_RECREATE_TARGET) Drop(_target);
	}

	/** What is under a point of the client area (pixels). */
	int HitTest(POINT pt) const {
		const float x = pt.x / _scale, y = pt.y / _scale;
		auto in = [&](const D2D1_RECT_F& r) { return x >= r.left && x < r.right && y >= r.top && y < r.bottom; };
		for (size_t i = 0; i < _items.size(); i++) if (in(_items[i].box)) return (int)i;
		if (_pager && in(_prevBox)) return kPrev;
		if (_pager && in(_nextBox)) return kNext;
		return -1;
	}

	void Place(const RECT& caret, SIZE size) {
		POINT pt = { caret.left - (LONG)(Look::padX * _scale), caret.bottom + 4 };
		HMONITOR mon = MonitorFromRect(&caret, MONITOR_DEFAULTTONEAREST);
		MONITORINFO mi = { sizeof mi };
		if (GetMonitorInfoW(mon, &mi)) {
			const RECT& wa = mi.rcWork;
			if (pt.y + size.cy > wa.bottom) pt.y = caret.top - size.cy - 4;
			if (pt.x + size.cx > wa.right) pt.x = wa.right - size.cx;
			if (pt.x < wa.left) pt.x = wa.left;
			if (pt.y < wa.top) pt.y = wa.top;
		}
		SetWindowPos(_hwnd, HWND_TOPMOST, pt.x, pt.y, size.cx, size.cy, SWP_NOACTIVATE | SWP_SHOWWINDOW);
	}

	void ShowAt(const RECT& caret) {
		EnsureWindow();
		if (!_hwnd) return;
		_scale = DpiOf(_hwnd) / 96.f;
		bool dark = SystemUsesDark();
		if (_dwmRound && (dark != _dark || !IsWindowVisible(_hwnd))) {
			COLORREF border = PaletteFor(dark).borderRef;
			DwmSetWindowAttribute(_hwnd, 34 /* DWMWA_BORDER_COLOR */, &border, sizeof border);
		}
		_dark = dark;
		SIZE size = Layout();
		Place(caret, size);
		InvalidateRect(_hwnd, nullptr, FALSE);
	}

public:
	explicit CandidateWindow(TextService* owner) : _owner(owner) {}
	~CandidateWindow() { Destroy(); }

	void Show(const RECT& caret, const ImeState& s, LANGID lang) {
		_flash.clear();
		KillTimerIfAny();
		// Shown again (composing now): the words offered after a commit no longer time out.
		if (_hwnd) KillTimer(_hwnd, 2);
		_state = s;
		_lang = lang ? lang : 0x0404;
		_hover = -1;
		ShowAt(caret);
	}

	/** A brief sign near the caret (中 / 英), gone after a moment. */
	void Flash(const RECT& caret, const std::wstring& text, LANGID lang) {
		_flash = text;
		_state = ImeState();
		_lang = lang ? lang : 0x0404;
		ShowAt(caret);
		if (_hwnd) SetTimer(_hwnd, 1, 700, nullptr);
	}

	void Hide() {
		if (_hwnd) { ShowWindow(_hwnd, SW_HIDE); KillTimer(_hwnd, 2); }
		_flash.clear();
		_hover = -1;
	}

	/** Gone after `ms` unless shown again (the words offered after a commit). */
	void HideAfter(UINT ms) { if (_hwnd) SetTimer(_hwnd, 2, ms, nullptr); }

	bool Visible() const { return _hwnd && IsWindowVisible(_hwnd); }

	void Destroy() {
		if (_hwnd) { DestroyWindow(_hwnd); _hwnd = nullptr; }
		DropLayouts();
		DropFormats();
		Drop(_target);
	}

	void KillTimerIfAny() { if (_hwnd) KillTimer(_hwnd, 1); }

	friend class TextService;
};

// ---------------------------------------------------------------- edit sessions

class EditSession : public ITfEditSession {
	LONG _ref = 1;
	std::function<void(TfEditCookie)> _fn;
	IUnknown* _keep;
public:
	/** `keep` (the text service, the context) stays alive until the session has run. */
	EditSession(std::function<void(TfEditCookie)> fn, IUnknown* keep1, IUnknown* keep2) : _fn(std::move(fn)), _keep(keep1), _keep2(keep2) {
		DllAddRef();
		if (_keep) _keep->AddRef();
		if (_keep2) _keep2->AddRef();
	}
	virtual ~EditSession() {
		if (_keep) _keep->Release();
		if (_keep2) _keep2->Release();
		DllRelease();
	}
	IUnknown* _keep2;
	STDMETHODIMP QueryInterface(REFIID riid, void** ppv) override {
		if (!ppv) return E_INVALIDARG;
		*ppv = nullptr;
		if (IsEqualIID(riid, IID_IUnknown) || IsEqualIID(riid, IID_ITfEditSession)) *ppv = static_cast<ITfEditSession*>(this);
		if (!*ppv) return E_NOINTERFACE;
		AddRef();
		return S_OK;
	}
	STDMETHODIMP_(ULONG) AddRef() override { return InterlockedIncrement(&_ref); }
	STDMETHODIMP_(ULONG) Release() override { LONG r = InterlockedDecrement(&_ref); if (!r) delete this; return r; }
	STDMETHODIMP DoEditSession(TfEditCookie ec) override { if (_fn) _fn(ec); return S_OK; }
};

// ---------------------------------------------------------------- the text service

class TextService : public ITfTextInputProcessorEx, public ITfThreadMgrEventSink, public ITfKeyEventSink, public ITfCompositionSink {
	LONG _ref = 1;
	ITfThreadMgr* _tm = nullptr;
	TfClientId _tid = TF_CLIENTID_NULL;
	DWORD _tmCookie = TF_INVALID_COOKIE;
	bool _keySink = false;
	ITfComposition* _composition = nullptr;
	ITfContext* _context = nullptr;
	ITfInputProcessorProfileMgr* _profiles = nullptr;
	HostPipe _pipe;
	LANGID _helloLang = 0;
	CandidateWindow _window;
	RECT _caret = {};
	bool _shiftDown = false, _otherKey = false;
	ULONGLONG _lastToggle = 0, _lastOtherKey = 0;
	/** Asks the registered DLL to swap this build for a newer one (null: nobody to ask). */
	void (CALLBACK* _reload)(void*) = nullptr;
	void* _reloadCtx = nullptr;
	ULONGLONG _nextVersionCheck = 0;
	bool _reloadAsked = false;

	void SetContext(ITfContext* pic) {
		if (pic == _context) return;
		if (pic) pic->AddRef();
		if (_context) _context->Release();
		_context = pic;
	}

	LANGID ActiveLang() {
		if (!_profiles) CoCreateInstance(CLSID_TF_InputProcessorProfiles, nullptr, CLSCTX_INPROC_SERVER, IID_ITfInputProcessorProfileMgr, (void**)&_profiles);
		TF_INPUTPROCESSORPROFILE p = {};
		if (_profiles && SUCCEEDED(_profiles->GetActiveProfile(CAT_TIP_KEYBOARD, &p)) && IsEqualCLSID(p.clsid, CLSID_BreezellIME)) return p.langid;
		return 0x0404;
	}

	/** Connected and told which language this is (`launch`: start the host when it is not running). */
	bool Ready(bool launch = true) {
		LANGID lang = ActiveLang();
		if (!_pipe.Connected()) {
			_helloLang = 0;
			if (!(launch ? _pipe.Connect() : _pipe.ConnectIfRunning())) return false;
		}
		if (lang != _helloLang) {
			wchar_t path[MAX_PATH] = {};
			GetModuleFileNameW(nullptr, path, MAX_PATH);
			const wchar_t* exe = wcsrchr(path, L'\\');
			char line[400];
			StringCchPrintfA(line, 400, "H\t%s\t%u\t%lu\t%u", ToUtf8(exe ? exe + 1 : path).c_str(), (unsigned)lang, (unsigned long)GetCurrentProcessId(), (unsigned)TIP_VERSION);
			std::string reply;
			// The first hello of a language may load its models: wait longer (not when just switched on).
			if (!_pipe.Request(line, reply, launch ? 15000 : 3000)) return false;
			_helloLang = lang;
		}
		return true;
	}

	/** Between keys, now and then: a newer build published? The registered DLL swaps to it. */
	void CheckForNewerBuild();

	/**
	 * A Shift let go: when it was pressed alone, native ⇄ English everywhere (Breezell's own input
	 * method too). Returns whether it switched (or just did: the same press seen twice).
	 */
	bool ToggleFromShift(ITfContext* pic) {
		const ULONGLONG now = GetTickCount64();
		if (now - _lastToggle < 250) return true;
		// Alone: no other key while it was down (when the press was seen), else none just before.
		const bool lone = _shiftDown ? !_otherKey : now - _lastOtherKey > 400;
		_shiftDown = false;
		_otherKey = false;
		// Shift held while clicking (selecting text) is not a switch.
		const bool clicked = ((GetAsyncKeyState(VK_LBUTTON) | GetAsyncKeyState(VK_RBUTTON) | GetAsyncKeyState(VK_MBUTTON)) & 0x8001) != 0;
		if (!lone || clicked || !Ready()) return false;
		_lastToggle = now;
		std::string reply;
		ImeState s;
		if (!_pipe.Request("M", reply, 1500) || !ParseState(reply, s)) return false;
		if (pic) Apply(pic, s);
		if (s.quiet || !pic) return true;  // Breezell's own input method switched, and shows it
		RECT caret = _caret;
		bool got = false;
		Edit(pic, [this, pic, &caret, &got](TfEditCookie ec) { got = CaretRect(ec, pic, caret); }, false);
		if (got) _caret = caret; else FallbackCaret();
		LANGID lang = _helloLang;
		const wchar_t* native = lang == 0x0411 ? L"あ" : lang == 0x0412 ? L"한" : L"中";
		_window.Flash(_caret, s.english ? L"英" : native, lang);
		return true;
	}

	void PreserveShift(bool on) {
		ITfKeystrokeMgr* km = nullptr;
		if (!_tm || FAILED(_tm->QueryInterface(IID_ITfKeystrokeMgr, (void**)&km))) return;
		TF_PRESERVEDKEY plain = { VK_SHIFT, TF_MOD_ON_KEYUP }, flagged = { VK_SHIFT, TF_MOD_ON_KEYUP | TF_MOD_SHIFT };
		if (on) {
			km->PreserveKey(_tid, GUID_PRESERVE_SHIFT, &plain, L"中／英", 3);
			km->PreserveKey(_tid, GUID_PRESERVE_SHIFT_FLAG, &flagged, L"中／英", 3);
		} else {
			km->UnpreserveKey(GUID_PRESERVE_SHIFT, &plain);
			km->UnpreserveKey(GUID_PRESERVE_SHIFT_FLAG, &flagged);
		}
		km->Release();
	}

	struct Key { unsigned vk, ch, mods; };

	static Key KeyOf(WPARAM wParam, LPARAM lParam) {
		BYTE ks[256] = {};
		GetKeyboardState(ks);
		unsigned mods = 0;
		if (ks[VK_SHIFT] & 0x80) mods |= 1;
		if (ks[VK_CONTROL] & 0x80) mods |= 2;
		if (ks[VK_MENU] & 0x80) mods |= 4;
		if (ks[VK_CAPITAL] & 1) mods |= 8;
		wchar_t buf[8] = {};
		unsigned ch = 0;
		if (!(mods & 6)) {
			int n = ToUnicodeEx((UINT)wParam, (UINT)((lParam >> 16) & 0xff), ks, buf, 8, 4, GetKeyboardLayout(0));
			if (n == 1 && buf[0] >= 0x20) ch = buf[0];
		}
		return { (unsigned)wParam, ch, mods };
	}

	bool Ask(const char* op, const Key& k, ImeState& s) {
		char line[64];
		StringCchPrintfA(line, 64, "%s\t%u\t%u\t%u", op, k.vk, k.ch, k.mods);
		std::string reply;
		return _pipe.Request(line, reply, 1500) && ParseState(reply, s);
	}

	static bool IsShift(WPARAM vk) { return vk == VK_SHIFT || vk == VK_LSHIFT || vk == VK_RSHIFT; }

	void SelectEnd(TfEditCookie ec, ITfContext* pic, ITfRange* range) {
		ITfRange* end = nullptr;
		if (SUCCEEDED(range->Clone(&end))) {
			end->Collapse(ec, TF_ANCHOR_END);
			TF_SELECTION sel = {};
			sel.range = end;
			sel.style.ase = TF_AE_NONE;
			sel.style.fInterimChar = FALSE;
			pic->SetSelection(ec, 1, &sel);
			end->Release();
		}
	}

	void SetComposition(TfEditCookie ec, ITfContext* pic, const std::wstring& text) {
		if (!_composition) {
			ITfInsertAtSelection* ins = nullptr;
			ITfRange* range = nullptr;
			if (FAILED(pic->QueryInterface(IID_ITfInsertAtSelection, (void**)&ins))) return;
			HRESULT hr = ins->InsertTextAtSelection(ec, TF_IAS_QUERYONLY, nullptr, 0, &range);
			ins->Release();
			if (FAILED(hr) || !range) return;
			ITfContextComposition* cc = nullptr;
			if (SUCCEEDED(pic->QueryInterface(IID_ITfContextComposition, (void**)&cc))) {
				cc->StartComposition(ec, range, static_cast<ITfCompositionSink*>(this), &_composition);
				cc->Release();
			}
			range->Release();
			if (!_composition) return;
		}
		ITfRange* r = nullptr;
		if (SUCCEEDED(_composition->GetRange(&r))) {
			r->SetText(ec, 0, text.c_str(), (LONG)text.size());
			SelectEnd(ec, pic, r);
			r->Release();
		}
	}

	void Commit(TfEditCookie ec, ITfContext* pic, const std::wstring& text) {
		if (_composition) {
			ITfRange* r = nullptr;
			if (SUCCEEDED(_composition->GetRange(&r))) {
				r->SetText(ec, 0, text.c_str(), (LONG)text.size());
				SelectEnd(ec, pic, r);
				r->Release();
			}
			_composition->EndComposition(ec);
			_composition->Release();
			_composition = nullptr;
			return;
		}
		ITfInsertAtSelection* ins = nullptr;
		if (FAILED(pic->QueryInterface(IID_ITfInsertAtSelection, (void**)&ins))) return;
		ITfRange* r = nullptr;
		if (SUCCEEDED(ins->InsertTextAtSelection(ec, 0, text.c_str(), (LONG)text.size(), &r)) && r) {
			SelectEnd(ec, pic, r);
			r->Release();
		}
		ins->Release();
	}

	void EndComposition(TfEditCookie ec) {
		if (!_composition) return;
		ITfRange* r = nullptr;
		if (SUCCEEDED(_composition->GetRange(&r))) {
			r->SetText(ec, 0, L"", 0);
			r->Release();
		}
		_composition->EndComposition(ec);
		_composition->Release();
		_composition = nullptr;
	}

	bool CaretRect(TfEditCookie ec, ITfContext* pic, RECT& rc) {
		ITfContextView* view = nullptr;
		if (FAILED(pic->GetActiveView(&view)) || !view) return false;
		ITfRange* r = nullptr;
		bool ok = false;
		if (_composition) {
			_composition->GetRange(&r);
		} else {
			TF_SELECTION sel = {};
			ULONG fetched = 0;
			if (SUCCEEDED(pic->GetSelection(ec, TF_DEFAULT_SELECTION, 1, &sel, &fetched)) && fetched) r = sel.range;
		}
		if (r) {
			BOOL clipped = FALSE;
			RECT got = {};
			if (SUCCEEDED(view->GetTextExt(ec, r, &got, &clipped)) && (got.left || got.top || got.right || got.bottom)) {
				rc = got;
				ok = true;
			}
			r->Release();
		}
		view->Release();
		return ok;
	}

	/** Where the caret is when the text service cannot ask the program (the system's caret, else the mouse). */
	void FallbackCaret() {
		GUITHREADINFO gi = { sizeof gi };
		if (GetGUIThreadInfo(GetCurrentThreadId(), &gi) && gi.hwndCaret) {
			RECT r = gi.rcCaret;
			MapWindowPoints(gi.hwndCaret, nullptr, (POINT*)&r, 2);
			_caret = r;
			return;
		}
		POINT p = {};
		GetCursorPos(&p);
		_caret = { p.x, p.y, p.x + 1, p.y + 16 };
	}

	/**
	 * Runs `fn` with an edit cookie: at once when the program allows (inside its key events), else
	 * later when `later` (the function must then hold nothing from the caller's stack).
	 */
	void Edit(ITfContext* pic, std::function<void(TfEditCookie)> fn, bool later) {
		IUnknown* self = static_cast<ITfTextInputProcessorEx*>(this);
		EditSession* es = new EditSession(fn, self, pic);
		HRESULT hrSession = E_FAIL;
		HRESULT hr = pic->RequestEditSession(_tid, es, TF_ES_SYNC | TF_ES_READWRITE, &hrSession);
		es->Release();
		if (later && (FAILED(hr) || hrSession == TF_E_SYNCHRONOUS)) {
			EditSession* async = new EditSession(fn, self, pic);
			pic->RequestEditSession(_tid, async, TF_ES_ASYNCDONTCARE | TF_ES_READWRITE, &hrSession);
			async->Release();
		}
	}

	/** Puts the host's answer in the program: the commit, then what is being composed, then the window. */
	void Apply(ITfContext* pic, const ImeState& s) {
		std::wstring commit = s.commit, preedit = s.preedit;
		bool composing = s.composing;
		Edit(pic, [this, pic, commit, preedit, composing](TfEditCookie ec) {
			if (!commit.empty()) Commit(ec, pic, commit);
			if (composing && !preedit.empty()) SetComposition(ec, pic, preedit);
			else if (_composition) EndComposition(ec);
		}, true);
		// Where the composition (or the caret) is now, for the window (only while the program lets us read at once).
		const bool show = !s.candidates.empty();
		bool gotCaret = false;
		RECT caret = {};
		if (show) Edit(pic, [this, pic, &gotCaret, &caret](TfEditCookie ec) { gotCaret = CaretRect(ec, pic, caret); }, false);
		if (gotCaret) _caret = caret; else if (show) FallbackCaret();
		if (show) {
			_window.Show(_caret, s, _helloLang);
			// Not composing: the words offered after a commit, until the next key (or a while).
			if (!composing) _window.HideAfter(5000);
		} else {
			_window.Hide();
		}
	}

public:
	explicit TextService(void (CALLBACK* reload)(void*) = nullptr, void* ctx = nullptr) : _window(this), _reload(reload), _reloadCtx(ctx) { DllAddRef(); }
	virtual ~TextService() { DllRelease(); }

	// IUnknown
	STDMETHODIMP QueryInterface(REFIID riid, void** ppv) override {
		if (!ppv) return E_INVALIDARG;
		*ppv = nullptr;
		if (IsEqualIID(riid, IID_IUnknown) || IsEqualIID(riid, IID_ITfTextInputProcessor) || IsEqualIID(riid, IID_ITfTextInputProcessorEx)) *ppv = static_cast<ITfTextInputProcessorEx*>(this);
		else if (IsEqualIID(riid, IID_ITfThreadMgrEventSink)) *ppv = static_cast<ITfThreadMgrEventSink*>(this);
		else if (IsEqualIID(riid, IID_ITfKeyEventSink)) *ppv = static_cast<ITfKeyEventSink*>(this);
		else if (IsEqualIID(riid, IID_ITfCompositionSink)) *ppv = static_cast<ITfCompositionSink*>(this);
		if (!*ppv) return E_NOINTERFACE;
		AddRef();
		return S_OK;
	}
	STDMETHODIMP_(ULONG) AddRef() override { return InterlockedIncrement(&_ref); }
	STDMETHODIMP_(ULONG) Release() override { LONG r = InterlockedDecrement(&_ref); if (!r) delete this; return r; }

	// ITfTextInputProcessor(Ex)
	STDMETHODIMP Activate(ITfThreadMgr* ptim, TfClientId tid) override { return ActivateEx(ptim, tid, 0); }
	STDMETHODIMP ActivateEx(ITfThreadMgr* ptim, TfClientId tid, DWORD) override {
		_tm = ptim;
		_tm->AddRef();
		_tid = tid;
		ITfSource* src = nullptr;
		if (SUCCEEDED(_tm->QueryInterface(IID_ITfSource, (void**)&src))) {
			src->AdviseSink(IID_ITfThreadMgrEventSink, static_cast<ITfThreadMgrEventSink*>(this), &_tmCookie);
			src->Release();
		}
		ITfKeystrokeMgr* km = nullptr;
		if (SUCCEEDED(_tm->QueryInterface(IID_ITfKeystrokeMgr, (void**)&km))) {
			_keySink = SUCCEEDED(km->AdviseKeyEventSink(_tid, static_cast<ITfKeyEventSink*>(this), TRUE));
			km->Release();
		}
		PreserveShift(true);
		// Say hello now if the host runs: Breezell's own input method follows this one's mode.
		Ready(false);
		return S_OK;
	}
	STDMETHODIMP Deactivate() override {
		if (_composition && _context) {
			ITfContext* pic = _context;
			Edit(pic, [this](TfEditCookie ec) { EndComposition(ec); }, false);
		}
		if (_composition) { _composition->Release(); _composition = nullptr; }
		if (_pipe.Connected()) { std::string r; _pipe.Request("R", r, 300); }
		_window.Destroy();
		PreserveShift(false);
		if (_tm) {
			if (_keySink) {
				ITfKeystrokeMgr* km = nullptr;
				if (SUCCEEDED(_tm->QueryInterface(IID_ITfKeystrokeMgr, (void**)&km))) { km->UnadviseKeyEventSink(_tid); km->Release(); }
				_keySink = false;
			}
			if (_tmCookie != TF_INVALID_COOKIE) {
				ITfSource* src = nullptr;
				if (SUCCEEDED(_tm->QueryInterface(IID_ITfSource, (void**)&src))) { src->UnadviseSink(_tmCookie); src->Release(); }
				_tmCookie = TF_INVALID_COOKIE;
			}
			_tm->Release();
			_tm = nullptr;
		}
		SetContext(nullptr);
		if (_profiles) { _profiles->Release(); _profiles = nullptr; }
		_pipe.Close();
		_helloLang = 0;
		_tid = TF_CLIENTID_NULL;
		return S_OK;
	}

	// ITfThreadMgrEventSink
	STDMETHODIMP OnInitDocumentMgr(ITfDocumentMgr*) override { return S_OK; }
	STDMETHODIMP OnUninitDocumentMgr(ITfDocumentMgr*) override { return S_OK; }
	STDMETHODIMP OnSetFocus(ITfDocumentMgr*, ITfDocumentMgr*) override {
		Trace("focus moved (build %d)", TIP_VERSION);
		// A newer build published? Focus moving (another window, another field) is a good moment.
		_nextVersionCheck = 0;
		CheckForNewerBuild();
		// Focus moved: what was composed stays as typed, the candidates go.
		if (_composition && _context) {
			ITfContext* pic = _context;
			Edit(pic, [this](TfEditCookie ec) {
				if (!_composition) return;
				_composition->EndComposition(ec);
				_composition->Release();
				_composition = nullptr;
			}, false);
		}
		if (_pipe.Connected()) { std::string r; _pipe.Request("R", r, 300); }
		_window.Hide();
		return S_OK;
	}
	STDMETHODIMP OnPushContext(ITfContext*) override { return S_OK; }
	STDMETHODIMP OnPopContext(ITfContext*) override { return S_OK; }

	// ITfKeyEventSink
	STDMETHODIMP OnSetFocus(BOOL) override { return S_OK; }
	STDMETHODIMP OnTestKeyDown(ITfContext* pic, WPARAM wParam, LPARAM lParam, BOOL* pfEaten) override {
		*pfEaten = FALSE;
		if (IsShift(wParam)) {
			if (!_shiftDown) {
				_shiftDown = true;
				_otherKey = false;
				// Clears the "pressed since" bits: a click from now on means Shift+click, not a switch.
				GetAsyncKeyState(VK_LBUTTON); GetAsyncKeyState(VK_RBUTTON); GetAsyncKeyState(VK_MBUTTON);
			}
			return S_OK;
		}
		if (_shiftDown) _otherKey = true;
		_lastOtherKey = GetTickCount64();
		CheckForNewerBuild();
		if (!Ready()) return S_OK;
		SetContext(pic);
		Key k = KeyOf(wParam, lParam);
		char line[64];
		StringCchPrintfA(line, 64, "T\t%u\t%u\t%u", k.vk, k.ch, k.mods);
		std::string reply;
		if (_pipe.Request(line, reply, 1500) && reply.size() >= 3 && reply[0] == 'E') *pfEaten = reply[2] == '1';
		// A key of the program's: the words offered after a commit go.
		if (!*pfEaten && !_composition && _window.Visible()) _window.Hide();
		return S_OK;
	}
	STDMETHODIMP OnKeyDown(ITfContext* pic, WPARAM wParam, LPARAM lParam, BOOL* pfEaten) override {
		*pfEaten = FALSE;
		if (IsShift(wParam) || !Ready()) return S_OK;
		SetContext(pic);
		ImeState s;
		if (!Ask("K", KeyOf(wParam, lParam), s)) return S_OK;
		*pfEaten = s.eaten ? TRUE : FALSE;
		if (s.eaten) Apply(pic, s);
		// A key of the program's (Backspace, an arrow; some programs skip the test call): the words
		// offered after a commit go.
		else if (!_composition && _window.Visible()) _window.Hide();
		return S_OK;
	}
	// Key up of a lone Shift: the preserved key normally takes it; programs that hand the key event
	// sink the key up instead get the switch here (a second one in the same press is ignored).
	STDMETHODIMP OnTestKeyUp(ITfContext*, WPARAM wParam, LPARAM, BOOL* pfEaten) override {
		*pfEaten = FALSE;
		if (IsShift(wParam)) {
			if (_shiftDown && !_otherKey && _pipe.Connected()) *pfEaten = TRUE;
			else _shiftDown = false;
		}
		return S_OK;
	}
	STDMETHODIMP OnKeyUp(ITfContext* pic, WPARAM wParam, LPARAM, BOOL* pfEaten) override {
		*pfEaten = FALSE;
		if (!IsShift(wParam)) return S_OK;
		*pfEaten = ToggleFromShift(pic) ? TRUE : FALSE;
		return S_OK;
	}
	STDMETHODIMP OnPreservedKey(ITfContext* pic, REFGUID rguid, BOOL* pfEaten) override {
		*pfEaten = FALSE;
		if (IsEqualGUID(rguid, GUID_PRESERVE_SHIFT) || IsEqualGUID(rguid, GUID_PRESERVE_SHIFT_FLAG)) {
			// Taken only when it switched: after Shift+A the program must see Shift go up.
			*pfEaten = ToggleFromShift(pic ? pic : _context) ? TRUE : FALSE;
		}
		return S_OK;
	}

	// ITfCompositionSink: the program ended our composition (a click elsewhere): the host forgets it too.
	STDMETHODIMP OnCompositionTerminated(TfEditCookie, ITfComposition*) override {
		if (_composition) { _composition->Release(); _composition = nullptr; }
		if (_pipe.Connected()) { std::string r; _pipe.Request("R", r, 300); }
		_window.Hide();
		return S_OK;
	}

	/** ‹ or › clicked in the panel. */
	void OnPageClick(int delta) {
		if (!_context || !_pipe.Connected()) return;
		std::string reply;
		ImeState s;
		if (_pipe.Request(delta < 0 ? "G\t-1" : "G\t1", reply, 1500) && ParseState(reply, s)) {
			ITfContext* pic = _context;
			pic->AddRef();
			Apply(pic, s);
			pic->Release();
		}
	}

	/** A candidate clicked in the window. */
	void OnCandidateClick(int index) {
		if (!_context || !_pipe.Connected()) return;
		char line[32];
		StringCchPrintfA(line, 32, "P\t%d", index);
		std::string reply;
		ImeState s;
		if (_pipe.Request(line, reply, 1500) && ParseState(reply, s)) {
			ITfContext* pic = _context;
			pic->AddRef();
			Apply(pic, s);
			pic->Release();
		}
	}
};

// ---------------------------------------------------------------- newer builds without restarting programs

typedef void (CALLBACK* ReloadFn)(void* ctx);
typedef HRESULT (STDAPICALLTYPE* CreateFn)(ReloadFn, void*, ITfTextInputProcessorEx**);

/** Where newer builds are published: a folder per version. Elevated or sandboxed programs only take Program Files'. */
static std::wstring TipRoot() {
	wchar_t buf[MAX_PATH] = {};
	if (!MayStartHost()) {
		ExpandEnvironmentStringsW(L"%ProgramFiles%\\BreezellIME\\tip", buf, MAX_PATH);
		return buf;
	}
	if (GetEnvironmentVariableW(L"BREEZELL_IME_TIP_ROOT", buf, MAX_PATH)) return buf;  // tests
	ExpandEnvironmentStringsW(L"%LOCALAPPDATA%\\BreezellIME\\tip", buf, MAX_PATH);
	return buf;
}

/** The newest version published, and the path of its DLL for this process; 0 when none. */
static DWORD PublishedBuild(std::wstring& dll) {
	DWORD v = 0, size = sizeof v;
	wchar_t env[32] = {};
	if (MayStartHost() && GetEnvironmentVariableW(L"BREEZELL_IME_TIP_VERSION", env, 32)) v = wcstoul(env, nullptr, 10);  // tests
	else if (RegGetValueW(HKEY_CURRENT_USER, L"Software\\BreezellIME", L"TipVersion", RRF_RT_REG_DWORD, nullptr, &v, &size) != ERROR_SUCCESS) v = 0;
	if (!v) return 0;
	dll = TipRoot() + L"\\" + std::to_wstring(v) + (sizeof(void*) == 8 ? L"\\BreezellIME64.dll" : L"\\BreezellIME32.dll");
	return GetFileAttributesW(dll.c_str()) == INVALID_FILE_ATTRIBUTES ? 0 : v;
}

void TextService::CheckForNewerBuild() {
	if (!_reload || _reloadAsked || _composition) return;
	const ULONGLONG now = GetTickCount64();
	if (now < _nextVersionCheck) return;
	_nextVersionCheck = now + 3000;
	std::wstring dll;
	DWORD published = PublishedBuild(dll);
	Trace("build %d: published %lu", TIP_VERSION, (unsigned long)published);
	if (published > TIP_VERSION) {
		_reloadAsked = true;
		_reload(_reloadCtx);
	}
}

/**
 * What the system creates: it runs the newest build there is (a published one, else this DLL's
 * own) and swaps to a newer one when that build asks, on a timer between keys. Old builds stay
 * loaded (something of them may still be queued); they no longer run.
 */
class Shim : public ITfTextInputProcessorEx {
	LONG _ref = 1;
	ITfTextInputProcessorEx* _inner = nullptr;
	ITfThreadMgr* _tm = nullptr;
	TfClientId _tid = TF_CLIENTID_NULL;
	DWORD _flags = 0;
	DWORD _running = 0, _failed = 0;
	UINT_PTR _timer = 0;
	static thread_local Shim* t_waiting;

	static void CALLBACK Requested(void* ctx) {
		Shim* self = static_cast<Shim*>(ctx);
		if (self->_timer) return;
		t_waiting = self;
		self->_timer = SetTimer(nullptr, 0, 30, &Shim::Tick);
		Trace("swap asked: timer %llu", (unsigned long long)self->_timer);
	}

	static void CALLBACK Tick(HWND, UINT, UINT_PTR id, DWORD) {
		KillTimer(nullptr, id);
		Shim* self = t_waiting;
		if (!self || self->_timer != id) return;
		self->_timer = 0;
		t_waiting = nullptr;
		self->Swap();
	}

	/** The newest build there is, ready to activate. */
	ITfTextInputProcessorEx* Make(DWORD& version) {
		std::wstring dll;
		DWORD v = PublishedBuild(dll);
		if (v > TIP_VERSION && v != _failed) {
			HMODULE m = LoadLibraryExW(dll.c_str(), nullptr, LOAD_WITH_ALTERED_SEARCH_PATH);
			CreateFn create = m ? reinterpret_cast<CreateFn>(GetProcAddress(m, "BreezellImeCreate")) : nullptr;
			ITfTextInputProcessorEx* p = nullptr;
			if (create && SUCCEEDED(create(&Shim::Requested, this, &p)) && p) {
				version = v;
				return p;
			}
			_failed = v;  // a bad build: this DLL's own goes on
		}
		version = TIP_VERSION;
		return new (std::nothrow) TextService(&Shim::Requested, this);
	}

	void Swap() {
		if (!_inner || !_tm) return;
		std::wstring dll;
		DWORD published = PublishedBuild(dll);
		Trace("swap: running %lu, published %lu", (unsigned long)_running, (unsigned long)published);
		if (published <= _running || published == _failed) return;
		DWORD version = 0;
		ITfTextInputProcessorEx* next = Make(version);
		if (!next) return;
		if (version == _running) { next->Release(); return; }
		_inner->Deactivate();
		_inner->Release();
		_inner = next;
		_running = version;
		_inner->ActivateEx(_tm, _tid, _flags);
	}

public:
	Shim() { DllAddRef(); }
	virtual ~Shim() { DllRelease(); }

	STDMETHODIMP QueryInterface(REFIID riid, void** ppv) override {
		if (!ppv) return E_INVALIDARG;
		*ppv = nullptr;
		if (IsEqualIID(riid, IID_IUnknown) || IsEqualIID(riid, IID_ITfTextInputProcessor) || IsEqualIID(riid, IID_ITfTextInputProcessorEx)) *ppv = static_cast<ITfTextInputProcessorEx*>(this);
		if (!*ppv) return E_NOINTERFACE;
		AddRef();
		return S_OK;
	}
	STDMETHODIMP_(ULONG) AddRef() override { return InterlockedIncrement(&_ref); }
	STDMETHODIMP_(ULONG) Release() override { LONG r = InterlockedDecrement(&_ref); if (!r) delete this; return r; }

	STDMETHODIMP Activate(ITfThreadMgr* ptim, TfClientId tid) override { return ActivateEx(ptim, tid, 0); }
	STDMETHODIMP ActivateEx(ITfThreadMgr* ptim, TfClientId tid, DWORD flags) override {
		if (!ptim) return E_INVALIDARG;
		_tm = ptim;
		_tm->AddRef();
		_tid = tid;
		_flags = flags;
		_inner = Make(_running);
		return _inner ? _inner->ActivateEx(ptim, tid, flags) : E_OUTOFMEMORY;
	}
	STDMETHODIMP Deactivate() override {
		if (_timer) { KillTimer(nullptr, _timer); _timer = 0; }
		if (t_waiting == this) t_waiting = nullptr;
		if (_inner) { _inner->Deactivate(); _inner->Release(); _inner = nullptr; }
		if (_tm) { _tm->Release(); _tm = nullptr; }
		return S_OK;
	}
};

thread_local Shim* Shim::t_waiting = nullptr;

/** A published build's entry (the registered DLL of a newer version calls this one's). */
extern "C" HRESULT STDAPICALLTYPE BreezellImeCreate(ReloadFn reload, void* ctx, ITfTextInputProcessorEx** out) {
	if (!out) return E_INVALIDARG;
	TextService* ts = new (std::nothrow) TextService(reload, ctx);
	if (!ts) return E_OUTOFMEMORY;
	*out = ts;
	return S_OK;
}

LRESULT CALLBACK CandidateWindow::Proc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
	CandidateWindow* self = reinterpret_cast<CandidateWindow*>(GetWindowLongPtrW(hwnd, GWLP_USERDATA));
	switch (msg) {
	case WM_NCCREATE: {
		CREATESTRUCTW* cs = reinterpret_cast<CREATESTRUCTW*>(lp);
		SetWindowLongPtrW(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(cs->lpCreateParams));
		return TRUE;
	}
	case WM_MOUSEACTIVATE:
		return MA_NOACTIVATE;
	case WM_ERASEBKGND:
		return 1;
	case WM_PAINT: {
		PAINTSTRUCT ps;
		HDC dc = BeginPaint(hwnd, &ps);
		if (self) {
			RECT rc;
			GetClientRect(hwnd, &rc);
			HDC mem = CreateCompatibleDC(dc);
			HBITMAP bmp = CreateCompatibleBitmap(dc, rc.right, rc.bottom);
			HGDIOBJ oldBmp = SelectObject(mem, bmp);
			self->Paint(mem, rc);
			BitBlt(dc, 0, 0, rc.right, rc.bottom, mem, 0, 0, SRCCOPY);
			SelectObject(mem, oldBmp);
			DeleteObject(bmp);
			DeleteDC(mem);
		}
		EndPaint(hwnd, &ps);
		return 0;
	}
	case WM_MOUSEMOVE:
		if (self && self->_flash.empty()) {
			POINT p = { (short)LOWORD(lp), (short)HIWORD(lp) };
			int hit = self->HitTest(p);
			if (hit != self->_hover) {
				self->_hover = hit;
				InvalidateRect(hwnd, nullptr, FALSE);
			}
			if (!self->_tracking) {
				TRACKMOUSEEVENT t = { sizeof t, TME_LEAVE, hwnd, 0 };
				self->_tracking = TrackMouseEvent(&t) != FALSE;
			}
		}
		return 0;
	case WM_MOUSELEAVE:
		if (self) {
			self->_tracking = false;
			if (self->_hover != -1) {
				self->_hover = -1;
				InvalidateRect(hwnd, nullptr, FALSE);
			}
		}
		return 0;
	case WM_LBUTTONUP:
		if (self && self->_flash.empty()) {
			POINT p = { (short)LOWORD(lp), (short)HIWORD(lp) };
			int hit = self->HitTest(p);
			if (hit >= 0) self->_owner->OnCandidateClick(hit);
			else if (hit == CandidateWindow::kPrev && self->_state.prev) self->_owner->OnPageClick(-1);
			else if (hit == CandidateWindow::kNext && self->_state.more) self->_owner->OnPageClick(1);
		}
		return 0;
	case WM_TIMER:
		if (wp == 1) {
			KillTimer(hwnd, 1);
			if (self && !self->_flash.empty()) self->Hide();
		} else if (wp == 2) {
			KillTimer(hwnd, 2);
			if (self) self->Hide();
		}
		return 0;
	}
	return DefWindowProcW(hwnd, msg, wp, lp);
}

// ---------------------------------------------------------------- class factory and DLL exports

class ClassFactory : public IClassFactory {
public:
	STDMETHODIMP QueryInterface(REFIID riid, void** ppv) override {
		if (!ppv) return E_INVALIDARG;
		*ppv = nullptr;
		if (IsEqualIID(riid, IID_IUnknown) || IsEqualIID(riid, IID_IClassFactory)) { *ppv = static_cast<IClassFactory*>(this); AddRef(); return S_OK; }
		return E_NOINTERFACE;
	}
	STDMETHODIMP_(ULONG) AddRef() override { DllAddRef(); return 2; }
	STDMETHODIMP_(ULONG) Release() override { DllRelease(); return 1; }
	STDMETHODIMP CreateInstance(IUnknown* outer, REFIID riid, void** ppv) override {
		if (!ppv) return E_INVALIDARG;
		*ppv = nullptr;
		if (outer) return CLASS_E_NOAGGREGATION;
		Shim* shim = new (std::nothrow) Shim();
		if (!shim) return E_OUTOFMEMORY;
		HRESULT hr = shim->QueryInterface(riid, ppv);
		shim->Release();
		return hr;
	}
	STDMETHODIMP LockServer(BOOL lock) override { if (lock) DllAddRef(); else DllRelease(); return S_OK; }
};

static ClassFactory g_factory;

BOOL WINAPI DllMain(HINSTANCE hInst, DWORD reason, LPVOID) {
	if (reason == DLL_PROCESS_ATTACH) {
		g_hInst = hInst;
		DisableThreadLibraryCalls(hInst);
	}
	return TRUE;
}

STDAPI DllGetClassObject(REFCLSID rclsid, REFIID riid, void** ppv) {
	if (!ppv) return E_INVALIDARG;
	*ppv = nullptr;
	if (!IsEqualCLSID(rclsid, CLSID_BreezellIME)) return CLASS_E_CLASSNOTAVAILABLE;
	return g_factory.QueryInterface(riid, ppv);
}

STDAPI DllCanUnloadNow() { return g_dllRefs <= 0 ? S_OK : S_FALSE; }

static std::wstring ClsidKey() {
	wchar_t guid[64];
	StringFromGUID2(CLSID_BreezellIME, guid, 64);
	return std::wstring(L"CLSID\\") + guid;
}

STDAPI DllRegisterServer() {
	wchar_t path[MAX_PATH] = {};
	GetModuleFileNameW(g_hInst, path, MAX_PATH);
	HKEY key = nullptr, inproc = nullptr;
	const wchar_t* title = L"Breezell IME";
	if (RegCreateKeyExW(HKEY_CLASSES_ROOT, ClsidKey().c_str(), 0, nullptr, 0, KEY_WRITE, nullptr, &key, nullptr) != ERROR_SUCCESS) return SELFREG_E_CLASS;
	RegSetValueExW(key, nullptr, 0, REG_SZ, (const BYTE*)title, (DWORD)((wcslen(title) + 1) * sizeof(wchar_t)));
	if (RegCreateKeyExW(key, L"InprocServer32", 0, nullptr, 0, KEY_WRITE, nullptr, &inproc, nullptr) == ERROR_SUCCESS) {
		const wchar_t* model = L"Apartment";
		RegSetValueExW(inproc, nullptr, 0, REG_SZ, (const BYTE*)path, (DWORD)((wcslen(path) + 1) * sizeof(wchar_t)));
		RegSetValueExW(inproc, L"ThreadingModel", 0, REG_SZ, (const BYTE*)model, (DWORD)((wcslen(model) + 1) * sizeof(wchar_t)));
		RegCloseKey(inproc);
	}
	RegCloseKey(key);

	HRESULT init = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
	HRESULT result = S_OK;
	ITfInputProcessorProfileMgr* pm = nullptr;
	if (SUCCEEDED(CoCreateInstance(CLSID_TF_InputProcessorProfiles, nullptr, CLSCTX_INPROC_SERVER, IID_ITfInputProcessorProfileMgr, (void**)&pm))) {
		for (const Profile& p : PROFILES) {
			// Not enabled by default: that would show it under every language the user has, whichever
			// was chosen. InstallLayoutOrTip turns on the one chosen, for that user.
			HRESULT hr = pm->RegisterProfile(CLSID_BreezellIME, p.lang, *p.guid, p.name, (ULONG)wcslen(p.name), path, (ULONG)wcslen(path), 0, nullptr, 0, FALSE, 0);
			if (FAILED(hr)) result = hr;
		}
		pm->Release();
	} else {
		result = E_FAIL;
	}
	ITfCategoryMgr* cm = nullptr;
	if (SUCCEEDED(CoCreateInstance(CLSID_TF_CategoryMgr, nullptr, CLSCTX_INPROC_SERVER, IID_ITfCategoryMgr, (void**)&cm))) {
		cm->RegisterCategory(CLSID_BreezellIME, CAT_TIP_KEYBOARD, CLSID_BreezellIME);
		cm->RegisterCategory(CLSID_BreezellIME, CAT_IMMERSIVE, CLSID_BreezellIME);
		cm->RegisterCategory(CLSID_BreezellIME, CAT_SYSTRAY, CLSID_BreezellIME);
		cm->Release();
	}
	if (SUCCEEDED(init)) CoUninitialize();
	return result;
}

STDAPI DllUnregisterServer() {
	HRESULT init = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
	ITfInputProcessorProfileMgr* pm = nullptr;
	if (SUCCEEDED(CoCreateInstance(CLSID_TF_InputProcessorProfiles, nullptr, CLSCTX_INPROC_SERVER, IID_ITfInputProcessorProfileMgr, (void**)&pm))) {
		for (const Profile& p : PROFILES) pm->UnregisterProfile(CLSID_BreezellIME, p.lang, *p.guid, 0);
		pm->Release();
	}
	ITfCategoryMgr* cm = nullptr;
	if (SUCCEEDED(CoCreateInstance(CLSID_TF_CategoryMgr, nullptr, CLSCTX_INPROC_SERVER, IID_ITfCategoryMgr, (void**)&cm))) {
		cm->UnregisterCategory(CLSID_BreezellIME, CAT_TIP_KEYBOARD, CLSID_BreezellIME);
		cm->UnregisterCategory(CLSID_BreezellIME, CAT_IMMERSIVE, CLSID_BreezellIME);
		cm->UnregisterCategory(CLSID_BreezellIME, CAT_SYSTRAY, CLSID_BreezellIME);
		cm->Release();
	}
	if (SUCCEEDED(init)) CoUninitialize();
	RegDeleteTreeW(HKEY_CLASSES_ROOT, ClsidKey().c_str());
	return S_OK;
}
