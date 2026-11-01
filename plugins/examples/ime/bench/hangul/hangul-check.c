/*
 * Reference composition from libhangul (Ubuntu's libhangul1), for checking engine/src/ko/hangul.ts:
 * reads key sequences, one per line, and writes what libhangul makes of each with the 2-set
 * keyboard ("2"). '<' is Backspace; keys libhangul does not take (space, digits…) flush the
 * syllable being built and pass through, as a text field would show them.
 */
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

typedef uint32_t ucschar;
typedef struct _HangulInputContext HangulInputContext;
HangulInputContext *hangul_ic_new(const char *keyboard);
void hangul_ic_delete(HangulInputContext *hic);
bool hangul_ic_process(HangulInputContext *hic, int ascii);
bool hangul_ic_backspace(HangulInputContext *hic);
const ucschar *hangul_ic_get_commit_string(HangulInputContext *hic);
const ucschar *hangul_ic_get_preedit_string(HangulInputContext *hic);
const ucschar *hangul_ic_flush(HangulInputContext *hic);
void hangul_ic_reset(HangulInputContext *hic);

static void put_utf8(ucschar c) {
	if (c < 0x80) putchar((int)c);
	else if (c < 0x800) { putchar(0xc0 | (c >> 6)); putchar(0x80 | (c & 0x3f)); }
	else if (c < 0x10000) { putchar(0xe0 | (c >> 12)); putchar(0x80 | ((c >> 6) & 0x3f)); putchar(0x80 | (c & 0x3f)); }
	else { putchar(0xf0 | (c >> 18)); putchar(0x80 | ((c >> 12) & 0x3f)); putchar(0x80 | ((c >> 6) & 0x3f)); putchar(0x80 | (c & 0x3f)); }
}
static ucschar out[1 << 16];
static size_t outLen;
static void add(const ucschar *s) { for (; s && *s; s++) out[outLen++] = *s; }

int main(void) {
	HangulInputContext *hic = hangul_ic_new("2");
	char line[1 << 16];
	while (fgets(line, sizeof line, stdin)) {
		size_t n = strlen(line);
		while (n && (line[n - 1] == '\n' || line[n - 1] == '\r')) line[--n] = 0;
		hangul_ic_reset(hic);
		outLen = 0;
		for (size_t i = 0; i < n; i++) {
			int k = (unsigned char)line[i];
			if (k == '<') {
				/* Nothing to take back in the syllable: the field's own Backspace takes the last character. */
				if (!hangul_ic_backspace(hic) && outLen) outLen--;
				continue;
			}
			bool taken = hangul_ic_process(hic, k);
			add(hangul_ic_get_commit_string(hic));
			if (!taken) { add(hangul_ic_flush(hic)); out[outLen++] = (ucschar)k; }
		}
		add(hangul_ic_flush(hic));
		for (size_t i = 0; i < outLen; i++) put_utf8(out[i]);
		putchar('\n');
	}
	hangul_ic_delete(hic);
	return 0;
}
