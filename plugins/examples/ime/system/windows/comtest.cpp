// Loads the text service DLL without registering it and walks its COM objects: the object the
// system creates, activation on a real thread manager (this build's own code), then a newer build
// "published" in a test folder (it must be the one that runs), then a broken one (this build's own
// must take over). comtest <path of BreezellIME64.dll or BreezellIME32.dll>
#include <windows.h>
#include <msctf.h>
#include <stdio.h>
#include <string>
static const CLSID CLSID_BreezellIME = { 0x124d7b5b, 0x968f, 0x4e0e, { 0xba, 0x91, 0x98, 0xf4, 0xf7, 0x7d, 0x1e, 0xb9 } };
typedef HRESULT (STDAPICALLTYPE *GetClassObject)(REFCLSID, REFIID, void**);
typedef HRESULT (STDAPICALLTYPE *CanUnload)();
static int failures = 0;
static void check(const char* what, bool ok) { printf("%s %s\n", ok ? "ok  " : "FAIL", what); if (!ok) failures++; }

/** Creates the text service the way the system does and activates / deactivates it. */
static bool Cycle(IClassFactory* cf, ITfThreadMgr* tm, TfClientId tid) {
	ITfTextInputProcessorEx* tip = nullptr;
	if (FAILED(cf->CreateInstance(nullptr, IID_ITfTextInputProcessorEx, (void**)&tip)) || !tip) return false;
	HRESULT a = tip->ActivateEx(tm, tid, 0);
	HRESULT d = tip->Deactivate();
	tip->Release();
	return SUCCEEDED(a) && SUCCEEDED(d);
}

int wmain(int argc, wchar_t** argv) {
	CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
	wchar_t trace[MAX_PATH];
	GetTempPathW(MAX_PATH, trace);
	wcscat_s(trace, L"breezell-tip-trace.txt");
	DeleteFileW(trace);
	SetEnvironmentVariableW(L"BREEZELL_IME_TRACE", trace);
	HMODULE dll = LoadLibraryW(argv[1]);
	if (!dll) { printf("load failed %lu\n", GetLastError()); return 1; }
	auto get = (GetClassObject)GetProcAddress(dll, "DllGetClassObject");
	auto canUnload = (CanUnload)GetProcAddress(dll, "DllCanUnloadNow");
	check("exports DllGetClassObject, DllCanUnloadNow, DllRegisterServer, DllUnregisterServer, BreezellImeCreate",
		get && canUnload && GetProcAddress(dll, "DllRegisterServer") && GetProcAddress(dll, "DllUnregisterServer") && GetProcAddress(dll, "BreezellImeCreate"));
	IClassFactory* cf = nullptr;
	check("class factory", SUCCEEDED(get(CLSID_BreezellIME, IID_IClassFactory, (void**)&cf)) && cf);
	IUnknown* obj = nullptr;
	check("text service object", SUCCEEDED(cf->CreateInstance(nullptr, IID_ITfTextInputProcessorEx, (void**)&obj)) && obj);
	IUnknown* p = nullptr;
	check("  is an ITfTextInputProcessor", SUCCEEDED(obj->QueryInterface(IID_ITfTextInputProcessor, (void**)&p)));
	if (p) p->Release();
	obj->Release();

	ITfThreadMgr* tm = nullptr;
	TfClientId tid = 0;
	check("thread manager", SUCCEEDED(CoCreateInstance(CLSID_TF_ThreadMgr, nullptr, CLSCTX_INPROC_SERVER, IID_ITfThreadMgr, (void**)&tm)) && SUCCEEDED(tm->Activate(&tid)));
	check("this build activates and deactivates", Cycle(cf, tm, tid));

	// A newer build published in a test folder: a copy of this DLL as version 99.
	wchar_t temp[MAX_PATH];
	GetTempPathW(MAX_PATH, temp);
	std::wstring root = std::wstring(temp) + L"breezell-tip-test";
	const wchar_t* name = sizeof(void*) == 8 ? L"BreezellIME64.dll" : L"BreezellIME32.dll";
	std::wstring v99 = root + L"\\99", copy = v99 + L"\\" + name;
	CreateDirectoryW(root.c_str(), nullptr);
	CreateDirectoryW(v99.c_str(), nullptr);
	CopyFileW(argv[1], copy.c_str(), FALSE);
	SetEnvironmentVariableW(L"BREEZELL_IME_TIP_ROOT", root.c_str());
	SetEnvironmentVariableW(L"BREEZELL_IME_TIP_VERSION", L"99");
	check("a newer published build activates", Cycle(cf, tm, tid));
	check("  and it is the one loaded", GetModuleHandleW(copy.c_str()) != nullptr);

	// Published while running: activated as this build in a focused document, the newer build
	// appears, the focus moving asks for it and the swap happens on a timer (messages pumped).
	SetEnvironmentVariableW(L"BREEZELL_IME_TIP_VERSION", nullptr);
	SetEnvironmentVariableW(L"BREEZELL_IME_TIP_ROOT", nullptr);
	{
		ITfDocumentMgr* dim = nullptr;
		ITfContext* ctx = nullptr;
		TfEditCookie ec = 0;
		ITfKeystrokeMgr* km = nullptr;
		ITfTextInputProcessorEx* tip = nullptr;
		// A window of our own whose focus is the document's (TSF moves its focus with the window's).
		HWND hwnd = CreateWindowExW(0, L"EDIT", L"", WS_OVERLAPPEDWINDOW | WS_VISIBLE, 0, 0, 200, 100, nullptr, nullptr, GetModuleHandleW(nullptr), nullptr);
		HWND other = CreateWindowExW(0, L"EDIT", L"", WS_OVERLAPPEDWINDOW | WS_VISIBLE, 0, 120, 200, 100, nullptr, nullptr, GetModuleHandleW(nullptr), nullptr);
		ITfDocumentMgr* prevDim = nullptr;
		bool ok = hwnd && SUCCEEDED(tm->CreateDocumentMgr(&dim)) && SUCCEEDED(dim->CreateContext(tid, 0, nullptr, &ctx, &ec)) && SUCCEEDED(dim->Push(ctx))
			&& SUCCEEDED(tm->AssociateFocus(hwnd, dim, &prevDim)) && SUCCEEDED(tm->QueryInterface(IID_ITfKeystrokeMgr, (void**)&km))
			&& SUCCEEDED(cf->CreateInstance(nullptr, IID_ITfTextInputProcessorEx, (void**)&tip)) && SUCCEEDED(tip->ActivateEx(tm, tid, 0));
		SetForegroundWindow(hwnd);
		SetFocus(hwnd);
		check("running: activated in a focused document", ok);
		std::wstring v77 = root + L"\\77", copy77 = v77 + L"\\" + name;
		CreateDirectoryW(v77.c_str(), nullptr);
		CopyFileW(argv[1], copy77.c_str(), FALSE);
		SetEnvironmentVariableW(L"BREEZELL_IME_TIP_ROOT", root.c_str());
		SetEnvironmentVariableW(L"BREEZELL_IME_TIP_VERSION", L"77");
		BOOL eaten = FALSE;
		// The focus moves away and back: the text service checks for a newer build.
		SetFocus(other);
		SetFocus(hwnd);
		tm->SetFocus(nullptr);
		tm->SetFocus(dim);
		for (int i = 0; i < 40 && !GetModuleHandleW(copy77.c_str()); i++) {
			MSG m;
			while (PeekMessageW(&m, nullptr, 0, 0, PM_REMOVE)) { TranslateMessage(&m); DispatchMessageW(&m); }
			Sleep(25);
		}
		// Focus moves only for the foreground window: Windows keeps another program in front of a
		// test started in the background, and then no focus moves (said, not counted as a failure).
		if (GetForegroundWindow() != hwnd && !GetModuleHandleW(copy77.c_str())) {
			printf("skip running: swap (another program has the foreground: no focus moves here)\n");
		} else {
			check("running: swapped to the build published meanwhile", GetModuleHandleW(copy77.c_str()) != nullptr);
		}
		if (km) km->TestKeyDown(VK_F13, 0, &eaten);  // the new build takes keys
		check("running: the new build deactivates", tip && SUCCEEDED(tip->Deactivate()));
		if (tip) tip->Release();
		if (km) km->Release();
		ITfDocumentMgr* none = nullptr;
		if (hwnd) tm->AssociateFocus(hwnd, prevDim, &none);
		if (none) none->Release();
		if (prevDim) prevDim->Release();
		if (dim) { dim->Pop(TF_POPF_ALL); dim->Release(); }
		if (ctx) ctx->Release();
		tm->SetFocus(nullptr);
		if (hwnd) DestroyWindow(hwnd);
		if (other) DestroyWindow(other);
	}

	// A broken build (not a DLL): this build's own takes over.
	std::wstring v98 = root + L"\\98", bad = v98 + L"\\" + name;
	CreateDirectoryW(v98.c_str(), nullptr);
	HANDLE h = CreateFileW(bad.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS, 0, nullptr);
	DWORD n = 0;
	WriteFile(h, "not a dll", 9, &n, nullptr);
	CloseHandle(h);
	SetEnvironmentVariableW(L"BREEZELL_IME_TIP_VERSION", L"98");
	check("a broken published build falls back to this one", Cycle(cf, tm, tid));
	// Published but missing: this one.
	SetEnvironmentVariableW(L"BREEZELL_IME_TIP_VERSION", L"97");
	check("a published version without its file falls back too", Cycle(cf, tm, tid));
	SetEnvironmentVariableW(L"BREEZELL_IME_TIP_VERSION", nullptr);
	SetEnvironmentVariableW(L"BREEZELL_IME_TIP_ROOT", nullptr);

	cf->Release();
	if (tm) { tm->Deactivate(); tm->Release(); }
	check("can unload", canUnload() == S_OK);
	FreeLibrary(dll);
	CoUninitialize();
	printf(failures ? "COM-FAILED\n" : "COM-OK\n");
	return failures ? 1 : 0;
}
