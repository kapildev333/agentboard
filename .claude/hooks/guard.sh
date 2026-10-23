#!/usr/bin/env bash
# PreToolUse guard. Exit 2 refuses the call and sends the reason back to the model.
# Modes: bash (checks tool_input.command), edit (checks tool_input.file_path).
# Self-check: bash .claude/hooks/guard-test.sh
mode="${1:-bash}"
input="$(cat)"
field() {
  node -e 'const i=JSON.parse(require("fs").readFileSync(0,"utf8"));const v=process.argv[1].split(".").reduce((o,k)=>(o==null?undefined:o[k]),i);process.stdout.write(v==null?"":String(v))' "$1" <<<"$input"
}
# The command with the bodies of file-writing heredocs (cat/tee > file <<EOF ... EOF) removed,
# so prose that mentions a forbidden word is not mistaken for running it.
command_text() {
  node -e '
const i=JSON.parse(require("fs").readFileSync(0,"utf8"));
const lines=String((i.tool_input&&i.tool_input.command)||"").split("\n");
const out=[];let skipTo=null;
for(const line of lines){
  if(skipTo!==null){ if(line.trim()===skipTo) skipTo=null; continue; }
  const m=line.match(/<<-?\s*(["'"'"']?)([A-Za-z_][A-Za-z0-9_]*)\1/);
  if(m){
    const seg=line.slice(0,m.index).split(/[;&|]+/).pop().trim();
    if(/^(cat|tee)\b/.test(seg)) skipTo=m[2];
  }
  out.push(line);
}
process.stdout.write(out.join("\n"));' <<<"$input"
}
# Code handed to an interpreter inline: heredocs fed to bash/python/node, -c and -e arguments,
# and anything piped into an interpreter. Inside it the forbidden words are refused anywhere.
inline_code() {
  node -e '
const i=JSON.parse(require("fs").readFileSync(0,"utf8"));
const text=String((i.tool_input&&i.tool_input.command)||"");
const interp=/^(python3?|node|bash|sh|zsh|perl|ruby)\b/;
const segs=[];let body=null,skipTo=null;
for(const line of text.split("\n")){
  if(skipTo!==null){
    if(line.trim()===skipTo){ if(body!==null){segs.push(body.join("\n"));body=null;} skipTo=null; }
    else if(body!==null) body.push(line);
    continue;
  }
  const m=line.match(/<<-?\s*(["'"'"']?)([A-Za-z_][A-Za-z0-9_]*)\1/);
  if(m){
    const seg=line.slice(0,m.index).split(/[;&|]+/).pop().trim();
    skipTo=m[2]; body=interp.test(seg)?[]:null;
  }
  const c=line.match(/(?:^|[;&|(]\s*)(python3?|node|bash|sh|zsh|perl|ruby)\b[^\n]*?\s-(c|e)\s+([\s\S]*)$/);
  if(c) segs.push(c[3]);
}
if(/\|\s*(python3?|node|bash|sh|zsh|perl|ruby)\b/.test(text)) segs.push(text);
process.stdout.write(segs.join("\n"));' <<<"$input"
}
deny() { echo "guard: $1" >&2; exit 2; }
role="${AGENTBOARD_ROLE:-governor}"
forbidden='curl|wget|ssh|scp|sftp|nc|ncat|telnet|sudo|docker|security|printenv'
case "$mode" in
  bash)
    cmd="$(command_text)"
    echo "$cmd" | grep -qE "(^|[;&|(] *)($forbidden)( |\$)" && deny "refused: network, credential or privileged command"
    code="$(inline_code)"
    # ponytail: a word match, not a parser; obfuscated code still needs the permission deny rules and auto mode.
    if [ -n "$code" ]; then
      echo "$code" | grep -qE "\\b($forbidden)\\b" && deny "refused: a forbidden command inside inline interpreter code"
    fi
    echo "$cmd" | grep -qE '(^|[;&|(] *)env *([;&|)]|$)' && deny "refused: dumping the environment"
    echo "$cmd" | grep -qE 'npm +publish|gh +auth|\$ANTHROPIC|ANTHROPIC_API_KEY|\.claude\.json|\.credentials\.json|\.ssh/|\.config/gh|id_rsa|id_ed25519|keychain' && deny "refused: publishing or credentials"
    echo "$cmd" | grep -qE 'git +push[^|;&]*( -f( |$)| --force( |$)| --force=)' && deny "refused: force push (use --force-with-lease after a rebase)"
    echo "$cmd" | grep -qE 'git +push[^|;&]*(origin +)?(main|master|HEAD:main)( |$)' && deny "refused: push to main"
    echo "$cmd" | grep -qE 'rm +-[a-zA-Z]*r[a-zA-Z]* +(/|~|\$HOME)( |/|$)' && deny "refused: recursive delete of home or root"
    echo "$cmd" | grep -qE 'pkill +-f|killall ' && deny "refused: pattern kills; stop processes by PID or port"
    if [ "$role" = worker ]; then
      echo "$cmd" | grep -qE '(^|[;&|(] *)(claude|gh +pr +merge|gh +repo|gh +api|git +merge|git +checkout +main|git +switch +main)( |$)' && deny "refused for workers: merging, repo admin or starting sessions"
      echo "$cmd" | grep -qE 'command +-v +claude|which +claude|/claude( |$|")|\$\([^)]*claude' && deny "refused for workers: running claude through a path or substitution"
    fi
    ;;
  edit)
    path="$(field tool_input.file_path)"
    [ -z "$path" ] && exit 0
    root="${CLAUDE_PROJECT_DIR:-$PWD}"
    case "$path" in
      "$root"/*) ;;
      "$HOME"/.claude/projects/*/memory/*) [ "${AGENTBOARD_ROLE:-}" = worker ] && deny "refused: workers do not write memory"; exit 0;;
      /*) deny "refused: edit outside the worktree: $path";;
    esac
    rel="${path#"$root"/}"
    case "$rel" in
      .env|.env.*) deny "refused: never write env files";;
      .claude/*|scripts/*|.github/*|.npmrc|CLAUDE.md) [ "$role" = worker ] && deny "refused for workers: $rel is governor-owned";;
    esac
    if [ "$role" = worker ] && [ -n "${AGENTBOARD_SCOPE:-}" ]; then
      ok=0
      IFS=: read -ra scopes <<<"$AGENTBOARD_SCOPE"
      for s in "${scopes[@]}"; do
        case "$rel" in "$s"|"$s"/*) ok=1;; esac
      done
      [ "$ok" = 1 ] || deny "refused: $rel is outside the lane scope ($AGENTBOARD_SCOPE); ask for it under Requests in the PR body"
    fi
    ;;
esac
exit 0
