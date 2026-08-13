package rpc

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"

	"github.com/cohub/apps/sandbox/env"
	"github.com/cohub/apps/sandbox/process"
	"github.com/cohub/apps/sandbox/protocol"
)

func newTreeDispatcher(t *testing.T, root string) *Dispatcher {
	t.Helper()
	cfg := env.Config{WorkspaceDir: root, Fence: true}
	return NewDispatcher(cfg, process.NewManager(slog.Default()), slog.Default())
}

func treeRequest(t *testing.T, params fsTreeParams) protocol.RPCRequest {
	t.Helper()
	raw, err := json.Marshal(params)
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}
	return protocol.RPCRequest{
		RequestScopedMessage: protocol.RequestScopedMessage{RequestID: "req-1"},
		Method:               "fs.tree",
		Params:               raw,
	}
}

func runTree(t *testing.T, d *Dispatcher, params fsTreeParams) map[string]interface{} {
	t.Helper()
	result := d.handleFSTree(treeRequest(t, params))
	m, ok := result.(map[string]interface{})
	if !ok {
		t.Fatalf("expected map result, got %T (%v)", result, result)
	}
	return m
}

func treeEntries(t *testing.T, m map[string]interface{}) []fsTreeEntry {
	t.Helper()
	raw, _ := json.Marshal(m["entries"])
	var entries []fsTreeEntry
	if err := json.Unmarshal(raw, &entries); err != nil {
		t.Fatalf("decode entries: %v", err)
	}
	return entries
}

func setupTree(t *testing.T) string {
	t.Helper()
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatalf("evalsymlinks: %v", err)
	}
	mustWrite := func(rel, content string) {
		abs := filepath.Join(root, rel)
		if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
		if err := os.WriteFile(abs, []byte(content), 0o644); err != nil {
			t.Fatalf("write %s: %v", rel, err)
		}
	}
	mustWrite("README.md", "hi")
	mustWrite("src/index.ts", "code")
	mustWrite("src/deep/util.ts", "deep")
	mustWrite("node_modules/pkg/index.js", "dep")
	mustWrite(".gitignore", "node_modules\n")
	if err := os.MkdirAll(filepath.Join(root, ".git", "objects"), 0o755); err != nil {
		t.Fatalf("mkdir .git: %v", err)
	}
	return root
}

func TestFSTreeDepthOne(t *testing.T) {
	root := setupTree(t)
	d := newTreeDispatcher(t, root)
	entries := treeEntries(t, runTree(t, d, fsTreeParams{Path: ".", Depth: 1}))

	names := map[string]bool{}
	for _, e := range entries {
		names[e.Path] = true
	}
	// Depth 1 lists direct children only.
	if !names["README.md"] || !names["src"] || !names[".gitignore"] {
		t.Fatalf("missing expected top-level entries: %v", names)
	}
	if names["src/index.ts"] {
		t.Fatalf("depth 1 should not recurse into src")
	}
	// .git and gitignored node_modules must be hidden.
	if names[".git"] || names["node_modules"] {
		t.Fatalf("expected .git and node_modules to be hidden: %v", names)
	}
}

func TestFSTreeDepthRecurse(t *testing.T) {
	root := setupTree(t)
	d := newTreeDispatcher(t, root)
	entries := treeEntries(t, runTree(t, d, fsTreeParams{Path: ".", Depth: 3}))

	names := map[string]bool{}
	for _, e := range entries {
		names[e.Path] = true
	}
	if !names["src/index.ts"] || !names["src/deep/util.ts"] {
		t.Fatalf("expected nested files at depth 3: %v", names)
	}
	// node_modules subtree stays hidden even when recursing.
	for p := range names {
		if p == "node_modules" || p == "node_modules/pkg" {
			t.Fatalf("node_modules subtree should be pruned: %v", names)
		}
	}
}

func TestFSTreeNoGitignore(t *testing.T) {
	root := setupTree(t)
	d := newTreeDispatcher(t, root)
	respect := false
	entries := treeEntries(t, runTree(t, d, fsTreeParams{Path: ".", Depth: 1, RespectGitignore: &respect}))

	names := map[string]bool{}
	for _, e := range entries {
		names[e.Path] = true
	}
	// With gitignore off, node_modules is visible; .git is always hidden.
	if !names["node_modules"] {
		t.Fatalf("expected node_modules visible without gitignore: %v", names)
	}
	if names[".git"] {
		t.Fatalf(".git must always be hidden: %v", names)
	}
}

func TestFSTreeTruncated(t *testing.T) {
	root := setupTree(t)
	d := newTreeDispatcher(t, root)
	m := runTree(t, d, fsTreeParams{Path: ".", Depth: 3, Limit: 2})
	entries := treeEntries(t, m)
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries under limit, got %d", len(entries))
	}
	if truncated, _ := m["truncated"].(bool); !truncated {
		t.Fatalf("expected truncated=true when limit reached")
	}
}

func writeRequest(t *testing.T, params fsWriteParams) protocol.RPCRequest {
	t.Helper()
	raw, err := json.Marshal(params)
	if err != nil {
		t.Fatalf("marshal write params: %v", err)
	}
	return protocol.RPCRequest{
		RequestScopedMessage: protocol.RequestScopedMessage{RequestID: "req-w"},
		Method:               "fs.write",
		Params:               raw,
	}
}

func mkdirRequest(t *testing.T, params fsMkdirParams) protocol.RPCRequest {
	t.Helper()
	raw, err := json.Marshal(params)
	if err != nil {
		t.Fatalf("marshal mkdir params: %v", err)
	}
	return protocol.RPCRequest{
		RequestScopedMessage: protocol.RequestScopedMessage{RequestID: "req-mkdir"},
		Method:               "fs.mkdir",
		Params:               raw,
	}
}

func TestFSMutationsReportFileParentAsNotDirectory(t *testing.T) {
	root := setupTree(t)
	d := newTreeDispatcher(t, root)
	if err := os.WriteFile(filepath.Join(root, "parent-file"), []byte("keep"), 0o644); err != nil {
		t.Fatalf("write parent file: %v", err)
	}

	results := []interface{}{
		d.handleFSWrite(writeRequest(t, fsWriteParams{Path: "parent-file/child.txt", Content: "content"})),
		d.handleFSMkdir(mkdirRequest(t, fsMkdirParams{Path: "parent-file/child"})),
	}
	for index, result := range results {
		failed, ok := result.(protocol.RPCFailed)
		if !ok {
			t.Fatalf("mutation %d: expected failure, got %T (%v)", index, result, result)
		}
		if failed.Error.Code != "NOT_DIRECTORY" {
			t.Fatalf("mutation %d: error code = %q, want NOT_DIRECTORY", index, failed.Error.Code)
		}
	}

	content, err := os.ReadFile(filepath.Join(root, "parent-file"))
	if err != nil {
		t.Fatalf("read parent file: %v", err)
	}
	if string(content) != "keep" {
		t.Fatalf("parent file content = %q, want unchanged", content)
	}
}

func TestFSWriteReportsCreatedFileAndParentDirectories(t *testing.T) {
	root := setupTree(t)
	d := newTreeDispatcher(t, root)

	res := d.handleFSWrite(writeRequest(t, fsWriteParams{Path: "aa/bb/c.txt", Content: "one"}))
	result, ok := res.(map[string]interface{})
	if !ok {
		t.Fatalf("expected nested write to succeed, got %T (%v)", res, res)
	}
	if created, _ := result["created"].(bool); !created {
		t.Fatalf("expected created=true, got %v", result["created"])
	}
	createdDirs, _ := result["createdDirs"].([]string)
	if !reflect.DeepEqual(createdDirs, []string{"aa", "aa/bb"}) {
		t.Fatalf("createdDirs = %v, want [aa aa/bb]", createdDirs)
	}

	res = d.handleFSWrite(writeRequest(t, fsWriteParams{Path: "aa/bb/c.txt", Content: "two"}))
	result, ok = res.(map[string]interface{})
	if !ok {
		t.Fatalf("expected overwrite to succeed, got %T (%v)", res, res)
	}
	if created, _ := result["created"].(bool); created {
		t.Fatalf("expected created=false for overwrite")
	}
	createdDirs, _ = result["createdDirs"].([]string)
	if len(createdDirs) != 0 {
		t.Fatalf("createdDirs = %v, want none", createdDirs)
	}
}

func TestFSWriteExclusive(t *testing.T) {
	root := setupTree(t)
	d := newTreeDispatcher(t, root)

	// First exclusive create succeeds.
	res := d.handleFSWrite(writeRequest(t, fsWriteParams{Path: "new.txt", Content: "one", Exclusive: true}))
	if _, ok := res.(map[string]interface{}); !ok {
		t.Fatalf("expected first exclusive create to succeed, got %T (%v)", res, res)
	}

	// Second exclusive create on the same path must fail ALREADY_EXISTS and not
	// clobber the original content.
	res2 := d.handleFSWrite(writeRequest(t, fsWriteParams{Path: "new.txt", Content: "two", Exclusive: true}))
	failed, ok := res2.(protocol.RPCFailed)
	if !ok {
		t.Fatalf("expected second exclusive create to fail, got %T", res2)
	}
	if failed.Error.Code != "ALREADY_EXISTS" {
		t.Fatalf("expected ALREADY_EXISTS, got %s", failed.Error.Code)
	}
	got, _ := os.ReadFile(filepath.Join(root, "new.txt"))
	if string(got) != "one" {
		t.Fatalf("exclusive create clobbered content: got %q", string(got))
	}
}

func TestResolvePathLockKeySymlinkAliases(t *testing.T) {
	root := setupTree(t)
	target := filepath.Join(root, "target.txt")
	if err := os.WriteFile(target, []byte("x"), 0o644); err != nil {
		t.Fatalf("seed target: %v", err)
	}
	for _, alias := range []string{"alias-a.txt", "alias-b.txt"} {
		if err := os.Symlink(target, filepath.Join(root, alias)); err != nil {
			t.Fatalf("create %s: %v", alias, err)
		}
	}

	// Distinct symlink aliases must resolve to the same lock key so writes
	// through either alias serialize against the same target file.
	keyA := resolvePathLockKey(filepath.Join(root, "alias-a.txt"))
	keyB := resolvePathLockKey(filepath.Join(root, "alias-b.txt"))
	if keyA != keyB {
		t.Fatalf("alias lock keys differ: %q vs %q", keyA, keyB)
	}
	if keyA != target {
		t.Fatalf("alias lock key = %q, want target %q", keyA, target)
	}

	// A path that does not exist yet falls back to the lexical path: there is
	// no symlink to resolve when the file is about to be created.
	missing := filepath.Join(root, "missing.txt")
	if key := resolvePathLockKey(missing); key != missing {
		t.Fatalf("missing path lock key = %q, want lexical %q", key, missing)
	}
}

func TestFSWriteConcurrentSymlinkAliases(t *testing.T) {
	root := setupTree(t)
	d := newTreeDispatcher(t, root)
	target := filepath.Join(root, "target.txt")
	if err := os.WriteFile(target, []byte(""), 0o644); err != nil {
		t.Fatalf("seed target: %v", err)
	}
	if err := os.Symlink(target, filepath.Join(root, "alias-a.txt")); err != nil {
		t.Fatalf("create alias-a: %v", err)
	}
	if err := os.Symlink(target, filepath.Join(root, "alias-b.txt")); err != nil {
		t.Fatalf("create alias-b: %v", err)
	}

	// Writes through distinct symlink aliases target the same file and must
	// share one per-path lock, otherwise the shorter write can leave the
	// longer content's tail behind (torn write).
	contents := []string{
		strings.Repeat("a", 4096),
		strings.Repeat("b", 2048),
	}
	paths := []string{"alias-a.txt", "alias-b.txt"}
	const rounds = 12
	var wg sync.WaitGroup
	for i := 0; i < rounds; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			raw, err := json.Marshal(fsWriteParams{Path: paths[i%2], Content: contents[i%2]})
			if err != nil {
				return
			}
			req := protocol.RPCRequest{
				RequestScopedMessage: protocol.RequestScopedMessage{RequestID: fmt.Sprintf("req-%d", i)},
				Method:               "fs.write",
				Params:               raw,
			}
			d.handleFSWrite(req)
		}(i)
	}
	wg.Wait()

	got, err := os.ReadFile(target)
	if err != nil {
		t.Fatalf("read target: %v", err)
	}
	wantLen := 4096
	if got[0] == 'b' {
		wantLen = 2048
	}
	if len(got) != wantLen {
		t.Fatalf("torn write via symlink aliases: length = %d, want %d", len(got), wantLen)
	}
	for index, b := range got {
		if b != got[0] {
			t.Fatalf("torn write via symlink aliases: mixed content at byte %d", index)
		}
	}
}

func TestFSTreeRootUnreadable(t *testing.T) {
	root := setupTree(t)
	d := newTreeDispatcher(t, root)
	// A non-existent root surfaces NOT_FOUND (stat) rather than an empty tree.
	res := d.handleFSTree(treeRequest(t, fsTreeParams{Path: "does-not-exist", Depth: 1}))
	if _, ok := res.(protocol.RPCFailed); !ok {
		t.Fatalf("expected failure for missing root, got %T", res)
	}
}

func writeResultVersion(t *testing.T, res interface{}) (size int64, mtimeMs int64) {
	t.Helper()
	result, ok := res.(map[string]interface{})
	if !ok {
		t.Fatalf("expected write to succeed, got %T (%v)", res, res)
	}
	written, ok := result["bytesWritten"].(int)
	if !ok {
		t.Fatalf("write result missing bytesWritten: %v", result)
	}
	size = int64(written)
	mtimeMs, ok = result["mtimeMs"].(int64)
	if !ok {
		t.Fatalf("write result missing mtimeMs: %v", result)
	}
	return size, mtimeMs
}

func TestFSWriteExpectedVersionMatches(t *testing.T) {
	root := setupTree(t)
	d := newTreeDispatcher(t, root)

	size, mtimeMs := writeResultVersion(t, d.handleFSWrite(writeRequest(t, fsWriteParams{Path: "v.txt", Content: "one"})))

	res := d.handleFSWrite(writeRequest(t, fsWriteParams{
		Path:     "v.txt",
		Content:  "two",
		Expected: &fsWriteVersion{Size: size, MtimeMs: mtimeMs},
	}))
	if _, ok := res.(map[string]interface{}); !ok {
		t.Fatalf("expected versioned write to succeed, got %T (%v)", res, res)
	}
	content, err := os.ReadFile(filepath.Join(root, "v.txt"))
	if err != nil {
		t.Fatalf("read file: %v", err)
	}
	if string(content) != "two" {
		t.Fatalf("content = %q, want %q", string(content), "two")
	}
}

func TestFSWriteExpectedVersionConflict(t *testing.T) {
	root := setupTree(t)
	d := newTreeDispatcher(t, root)

	size, mtimeMs := writeResultVersion(t, d.handleFSWrite(writeRequest(t, fsWriteParams{Path: "v.txt", Content: "one"})))
	// Another writer modifies the file after the baseline was captured.
	d.handleFSWrite(writeRequest(t, fsWriteParams{Path: "v.txt", Content: "changed by someone else"}))

	res := d.handleFSWrite(writeRequest(t, fsWriteParams{
		Path:     "v.txt",
		Content:  "mine",
		Expected: &fsWriteVersion{Size: size, MtimeMs: mtimeMs},
	}))
	failed, ok := res.(protocol.RPCFailed)
	if !ok {
		t.Fatalf("expected version conflict, got %T (%v)", res, res)
	}
	if failed.Error.Code != "CONFLICT" {
		t.Fatalf("error code = %q, want CONFLICT", failed.Error.Code)
	}
	content, err := os.ReadFile(filepath.Join(root, "v.txt"))
	if err != nil {
		t.Fatalf("read file: %v", err)
	}
	if string(content) != "changed by someone else" {
		t.Fatalf("conflicting write clobbered content: got %q", string(content))
	}
}

func TestFSWriteExpectedVersionMissingFile(t *testing.T) {
	root := setupTree(t)
	d := newTreeDispatcher(t, root)

	res := d.handleFSWrite(writeRequest(t, fsWriteParams{
		Path:     "missing.txt",
		Content:  "x",
		Expected: &fsWriteVersion{Size: 0, MtimeMs: 123},
	}))
	failed, ok := res.(protocol.RPCFailed)
	if !ok {
		t.Fatalf("expected version conflict for missing file, got %T (%v)", res, res)
	}
	if failed.Error.Code != "CONFLICT" {
		t.Fatalf("error code = %q, want CONFLICT", failed.Error.Code)
	}
}

func TestFSWriteConcurrentSamePath(t *testing.T) {
	root := setupTree(t)
	d := newTreeDispatcher(t, root)
	path := filepath.Join(root, "concurrent.txt")
	if err := os.WriteFile(path, []byte(""), 0o644); err != nil {
		t.Fatalf("seed file: %v", err)
	}

	// Unequal lengths are required to expose torn writes: a shorter write that
	// lands after a longer one leaves the longer content's tail in the file.
	contents := []string{
		strings.Repeat("a", 4096),
		strings.Repeat("b", 2048),
	}
	const rounds = 12
	var wg sync.WaitGroup
	for i := 0; i < rounds; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			raw, err := json.Marshal(fsWriteParams{Path: "concurrent.txt", Content: contents[i%2]})
			if err != nil {
				return
			}
			req := protocol.RPCRequest{
				RequestScopedMessage: protocol.RequestScopedMessage{RequestID: fmt.Sprintf("req-%d", i)},
				Method:               "fs.write",
				Params:               raw,
			}
			d.handleFSWrite(req)
		}(i)
	}
	wg.Wait()

	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read file: %v", err)
	}
	wantLen := 4096
	if got[0] == 'b' {
		wantLen = 2048
	}
	if len(got) != wantLen {
		t.Fatalf("torn write: length = %d, want %d", len(got), wantLen)
	}
	for index, b := range got {
		if b != got[0] {
			t.Fatalf("torn write: mixed content at byte %d", index)
		}
	}
}
