// generatePromptHandoff.js
// Executar com: node generatePromptHandoff.js

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "PROMPT_HANDOFF_IA.md");

const readIfExists = (filePath) => {
  try {
    return fs.readFileSync(filePath, "utf-8").trim();
  } catch {
    return "";
  }
};

const listDirs = (dir, depth = 0) => {
  if (depth > 2) return "";
  let result = "";
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    if (item.name.startsWith(".") || item.name === "node_modules") continue;
    const full = path.join(dir, item.name);
    result += `${"  ".repeat(depth)}- ${item.name}\n`;
    if (item.isDirectory()) {
      result += listDirs(full, depth + 1);
    }
  }
  return result;
};

// Coleta de informações
const packageJson = readIfExists(path.join(ROOT, "package.json"));
const readme = readIfExists(path.join(ROOT, "README.md"));
const contexto = readIfExists(path.join(ROOT, "docs/contexto.md"));
const decisoes = readIfExists(path.join(ROOT, "docs/decisoes.md"));
const estrutura = listDirs(ROOT);

// Montagem do PROMPT MESTRE
const prompt = `
# 🧠 PROMPT MESTRE — CONTEXTO COMPLETO DO PROJETO (HANDOFF)

IGNORE COMPLETAMENTE QUALQUER CONTEXTO EXTERNO.
Este documento representa o ESTADO ATUAL e OFICIAL do projeto.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VISÃO GERAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Este é um sistema tratado com nível de SISTEMA BANCÁRIO / CASSINO PROFISSIONAL.
Envolve dinheiro real, usuários reais e risco legal.

O backend é totalmente autoritativo.
O frontend NUNCA decide resultados.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OBJETIVO DO SISTEMA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${contexto || "Objetivo descrito implicitamente pelo código e estrutura do projeto."}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRINCÍPIOS INEGOCIÁVEIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Zero confiança no cliente
- Toda lógica crítica no backend
- RNG seguro e verificável
- Estados persistidos e auditáveis
- Impossibilidade de dinheiro infinito
- Código limpo > código esperto

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DECISÕES DE ARQUITETURA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${decisoes || "Decisões arquiteturais implícitas no código atual."}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STACK E DEPENDÊNCIAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${packageJson || "package.json não encontrado."}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ESTRUTURA DO PROJETO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${estrutura}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PADRÃO DE CÓDIGO E ESTILO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Funções pequenas e explícitas
- Validação rigorosa de inputs
- Tratamento claro de erros
- Logs sem dados sensíveis
- Segurança acima de performance

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MENTALIDADE ESPERADA DA IA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Você atua como:
- Arquiteto de Software Sênior
- Auditor de Segurança
- Desenvolvedor Backend Crítico

NÃO:
- Faça suposições
- Sugira gambiarras
- Quebre padrões sem justificativa

SE algo não puder ser validado:
Declare explicitamente.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ESTADO ATUAL DO PROJETO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${readme || "README não encontrado."}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSTRUÇÃO FINAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Antes de sugerir QUALQUER alteração:
- Absorva todo o contexto acima
- Entenda o sistema como um TODO
- Identifique pontos críticos
- Priorize segurança, consistência e produção real
`;

fs.writeFileSync(OUTPUT, prompt.trim());
console.log("✅ PROMPT_HANDOFF_IA.md gerado com sucesso.");
