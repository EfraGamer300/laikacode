#compdef laikacode laika

# Zsh completion for LaikaCode
# Add to fpath: fpath=(/path/to/laikacode/completions $fpath)

_laikacode() {
  local -a commands config_subs config_keys

  commands=(
    'config:Get or set configuration values'
    'help:Show help message'
  )

  config_subs=(
    'set:Set a config value'
    'get:Get a config value'
    'path:Show config file path'
    'edit:Open config in editor'
  )

  config_keys=(
    'apiKey:OpenRouter API key'
    'model:Model name (e.g. anthropic/claude-3.5-sonnet)'
    'smallModel:Small/fast model name'
    'baseURL:OpenRouter base URL'
    'maxTokens:Maximum tokens per response'
    'maxIterations:Maximum tool call iterations'
  )

  _arguments -C \
    '1:command:->command' \
    '*::arg:->args'

  case $state in
    command)
      _describe -t commands 'laikacode command' commands
      _arguments \
        '--help[Show help]' \
        '-h[Show help]' \
        '--version[Show version]' \
        '-v[Show version]'
      ;;
    args)
      case $words[1] in
        config)
          _describe -t config 'config subcommand' config_subs
          case $words[2] in
            set|get)
              _describe -t configkey 'config key' config_keys
              ;;
          esac
          ;;
      esac
      ;;
  esac
}

_laikacode "$@"
