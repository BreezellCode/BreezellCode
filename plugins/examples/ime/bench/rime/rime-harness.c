/*
 * A line protocol over librime, so the benchmark drives Rime exactly as it drives our engine.
 *
 *   S <schema>     select a schema (deploys on first use)
 *   K <keys>       clear, then type <keys> (Rime key sequence syntax: {space}, {BackSpace}, ...)
 *   A <keys>       type <keys> on top of the current composition
 *   P <index>      select candidate <index> (0-based, over all pages)
 *   C              clear the composition
 *   Q              quit
 *
 * Every command answers one JSON line: {"commit":"...","preedit":"...","cands":["...",...]}
 * with up to RIME_HARNESS_CANDS candidates (default 10).
 * Usage: rime-harness <shared_data_dir> <user_data_dir>
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <rime_api.h>

static RimeApi *rime;
static RimeSessionId session;
static int max_cands = 10;

static void put_json_string(const char *s) {
	putchar('"');
	for (const unsigned char *p = (const unsigned char *)(s ? s : ""); *p; p++) {
		if (*p == '"' || *p == '\\') { putchar('\\'); putchar(*p); }
		else if (*p == '\n') fputs("\\n", stdout);
		else if (*p < 0x20) printf("\\u%04x", *p);
		else putchar(*p);
	}
	putchar('"');
}

static void answer(void) {
	RIME_STRUCT(RimeCommit, commit);
	const char *committed = "";
	int has_commit = rime->get_commit(session, &commit);
	if (has_commit && commit.text) committed = commit.text;
	RIME_STRUCT(RimeContext, ctx);
	rime->get_context(session, &ctx);
	fputs("{\"commit\":", stdout);
	put_json_string(committed);
	fputs(",\"preedit\":", stdout);
	put_json_string(ctx.composition.preedit);
	fputs(",\"cands\":[", stdout);
	RimeCandidateListIterator it = {0};
	int n = 0;
	if (rime->candidate_list_begin(session, &it)) {
		while (n < max_cands && rime->candidate_list_next(&it)) {
			if (n) putchar(',');
			put_json_string(it.candidate.text);
			n++;
		}
		rime->candidate_list_end(&it);
	}
	fputs("]}\n", stdout);
	fflush(stdout);
	rime->free_context(&ctx);
	if (has_commit) rime->free_commit(&commit);
}

int main(int argc, char **argv) {
	if (argc < 3) { fprintf(stderr, "usage: %s <shared_data_dir> <user_data_dir>\n", argv[0]); return 2; }
	const char *n = getenv("RIME_HARNESS_CANDS");
	if (n) max_cands = atoi(n);
	rime = rime_get_api();
	RIME_STRUCT(RimeTraits, traits);
	traits.shared_data_dir = argv[1];
	traits.user_data_dir = argv[2];
	traits.distribution_name = "Breezell IME benchmark";
	traits.distribution_code_name = "breezell-bench";
	traits.distribution_version = "1";
	traits.app_name = "rime.breezell-bench";
	traits.min_log_level = 2;
	const char *modules[] = { "default", "lua", "octagram", NULL };
	traits.modules = modules;
	rime->setup(&traits);
	rime->initialize(&traits);
	if (rime->start_maintenance(1)) rime->join_maintenance_thread();
	session = rime->create_session();
	char line[65536];
	while (fgets(line, sizeof line, stdin)) {
		size_t len = strlen(line);
		while (len && (line[len - 1] == '\n' || line[len - 1] == '\r')) line[--len] = 0;
		if (!len) continue;
		char cmd = line[0];
		const char *arg = len > 2 ? line + 2 : "";
		switch (cmd) {
		case 'S': rime->select_schema(session, arg); rime->clear_composition(session); break;
		case 'K': rime->clear_composition(session); rime->simulate_key_sequence(session, arg); break;
		case 'A': rime->simulate_key_sequence(session, arg); break;
		case 'P': rime->select_candidate(session, (size_t)atoi(arg)); break;
		case 'C': rime->clear_composition(session); break;
		case 'Q': rime->destroy_session(session); rime->finalize(); return 0;
		default: break;
		}
		answer();
	}
	rime->destroy_session(session);
	rime->finalize();
	return 0;
}
