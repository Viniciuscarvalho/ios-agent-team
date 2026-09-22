# iOS Agent Team

Um kit para usar no **Claude Code** ao desenvolver projetos Swift. Ele instala cinco
agentes especializados em iOS, um guia de convenções e exemplos para equipes de
agentes e revisões programáticas.

> **Escopo atual:** os agentes em `.claude/agents/` são exclusivos do formato do
> Claude Code. Este repositório não oferece adaptadores para Codex, Gemini ou GitHub
> Copilot. Os exemplos em `sdk/` também usam o Claude Agent SDK.

## O que está incluído

| Componente | Para que serve |
| --- | --- |
| `ios-lead` | Coordena tarefas que envolvem mais de uma área. |
| `swiftui-expert` | Cria e revisa views, estado, navegação, desempenho e acessibilidade. |
| `swift-concurrency-expert` | Trabalha com `async/await`, actors, `Sendable` e migração para Swift 6. |
| `swift-testing-expert` | Escreve e melhora testes com Swift Testing e XCTest. |
| `ios-reviewer` | Faz revisão transversal de SwiftUI, concorrência, testes e acessibilidade. |
| `CLAUDE.md.snippet` | Convenções iniciais para copiar para o projeto consumidor. |
| `examples/` | Configuração opcional de equipes, hooks e prompts prontos. |
| `sdk/` | Exemplos TypeScript e Python para executar revisões via Claude Agent SDK. |

## Como funciona

Depois da instalação, o Claude Code encontra as definições em
`.claude/agents/`. Você pode pedir uma tarefa diretamente; para tarefas amplas,
`ios-lead` coordena os especialistas. Cada agente traz instruções para sua área e
persiste memória de projeto quando a versão do Claude Code suporta esse recurso.

```
Solicitação no Claude Code
        ↓
ios-lead ou especialista adequado
        ↓
SwiftUI · Concorrência · Testes · Revisão
```

As regras e a execução continuam sob controle do Claude Code. Não há aplicativo
iOS, servidor HTTP, CLI publicada ou workflow de CI instalado automaticamente por
este repositório.

## Requisitos

- Claude Code 2.1.33+ para memória persistente dos agentes.
- Uma conta, assinatura ou chave de API compatível com Claude Code.
- Um projeto Swift/SwiftUI onde os arquivos `.claude/` possam ser instalados.

Para equipes de agentes, habilite as variáveis experimentais do Claude Code em
`.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1",
    "CLAUDE_CODE_FORK_SUBAGENT": "1"
  }
}
```

`CLAUDE_CODE_FORK_SUBAGENT` é opcional, mas permite que especialistas herdem a
exploração já feita pelo coordenador.

## Instalação

No diretório raiz do projeto Swift que receberá os agentes:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/viniciuscarvalho/ios-agent-team/main/install.sh)
```

O instalador copia `.claude/agents/` e `.claude/skills/`, e cria ou oferece anexar
`CLAUDE.md.snippet` ao `CLAUDE.md` do projeto consumidor.

Para instalar a partir de um clone local:

```bash
git clone https://github.com/viniciuscarvalho/ios-agent-team.git /tmp/ios-agent-team
/tmp/ios-agent-team/install.sh /caminho/do/seu-projeto-ios
```

## Uso rápido

Abra o projeto consumidor no Claude Code e descreva o trabalho normalmente:

```text
Crie uma tela de configurações em SwiftUI com toggles acessíveis.
Corrija os erros de Sendable depois da migração para Swift 6.
Migre estes testes XCTest para Swift Testing.
Revise as alterações deste pull request.
```

Para chamar o coordenador explicitamente:

```bash
claude --agent ios-lead
```

Para uma tarefa ampla, peça uma equipe e atribua áreas sem sobreposição:

```text
Crie uma equipe para implementar o onboarding:
- swiftui-expert: telas e navegação
- swift-concurrency-expert: carregamento assíncrono
- swift-testing-expert: testes
```

Veja mais prompts copiáveis em
[`examples/agent-team-prompts.md`](examples/agent-team-prompts.md).

## Revisões programáticas

`sdk/ios-review-agent.ts` e `sdk/ios_ci_review.py` são exemplos para CI, bots de
pull request ou ferramentas internas. Eles não fazem parte da instalação dos
arquivos `.claude/` e exigem autenticação válida do Claude Agent SDK.

TypeScript:

```bash
bun add @anthropic-ai/claude-agent-sdk
bun run sdk/ios-review-agent.ts ./Sources "Review async image loading and its tests"
```

Python:

```bash
pip install claude-agent-sdk
python sdk/ios_ci_review.py --path ./Sources
```

## Roteamento opcional com Jev

O runner TypeScript pode usar [Jev](https://typesafe.ai) para decidir quais dos três
especialistas de revisão são relevantes: SwiftUI, concorrência e testes. Jev recebe
somente o texto da tarefa; o código-fonte não é enviado. Ele não substitui o Claude
Agent SDK nem toma ações por conta própria.

Crie um `.env` local (ele é ignorado pelo Git):

```bash
TYPESAFE_API_KEY=sua_chave
```

Depois inclua uma descrição da revisão como segundo argumento:

```bash
bun run sdk/ios-review-agent.ts ./Sources "Review the layout and VoiceOver labels"
```

Sem chave, com falha da API ou sem um sinal forte, o runner preserva a revisão
completa com os três especialistas. Valide a regra localmente com:

```bash
bun test sdk/jev-review-router.test.ts
```

## Personalização

- Ajuste destino mínimo, versão Swift e convenções no `CLAUDE.md` do projeto que
  recebeu o kit.
- Edite o campo `model` dos agentes somente se a sua instalação do Claude Code
  suportar o modelo escolhido.
- Adicione skills em `.claude/skills/` e referencie seus nomes no frontmatter do
  agente que deve carregá-las.
- Use `examples/settings.json` e `examples/hooks.json` como ponto de partida; eles
  não são copiados ou ativados automaticamente.

## Limitações atuais

- Integração nativa: somente Claude Code.
- SDKs de revisão: dependem do Claude Agent SDK e da respectiva autenticação.
- Jev: disponível apenas no runner TypeScript e usado somente para roteamento de
  especialistas.
- Nenhum adaptador para Codex, Gemini ou Copilot está incluído.

## Licença

MIT
