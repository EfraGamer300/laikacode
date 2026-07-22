# Bash completion for LaikaCode
# Source this file or add to /etc/bash_completion.d/

_laikacode_completions() {
  local cur prev opts
  COMPREPLY=()
  cur="${COMP_WORDS[COMP_CWORD]}"
  prev="${COMP_WORDS[COMP_CWORD-1]}"

  # Main commands
  local commands="config --help --version --help -h -v"

  # Config subcommands
  local config_subs="set get path edit"
  local config_keys="apiKey model smallModel baseURL maxTokens maxIterations"

  # If previous word is 'config', complete with subcommands
  if [[ ${prev} == "config" ]]; then
    COMPREPLY=( $(compgen -W "${config_subs}" -- ${cur}) )
    return 0
  fi

  # If previous word is config subcommand, complete with keys (for set/get) or nothing
  if [[ ${prev} == "set" || ${prev} == "get" ]] && [[ ${COMP_WORDS[COMP_CWORD-2]} == "config" ]]; then
    COMPREPLY=( $(compgen -W "${config_keys}" -- ${cur}) )
    return 0
  fi

  # If current word starts with -, complete with flags
  if [[ ${cur} == -* ]]; then
    COMPREPLY=( $(compgen -W "--help --version -h -v" -- ${cur}) )
    return 0
  fi

  # Default: complete commands + directories/files
  if [[ ${cur} == /* ]] || [[ ${cur} == .* ]]; then
    COMPREPLY=( $(compgen -f -- ${cur}) )
  else
    COMPREPLY=( $(compgen -W "${commands}" -- ${cur}) )
    # Also suggest directories for cd-like behavior
    COMPREPLY+=( $(compgen -d -- ${cur}) )
  fi
}

complete -F _laikacode_completions laikacode
complete -F _laikacode_completions laika
