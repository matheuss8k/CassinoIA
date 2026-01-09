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
Objetivo descrito implicitamente pelo código e estrutura do projeto.

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
Decisões arquiteturais implícitas no código atual.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STACK E DEPENDÊNCIAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "name": "casino-ai",
  "private": true,
  "version": "4.9.6",
  "type": "commonjs",
  "engines": {
    "node": ">=18.0.0"
  },
  "scripts": {
    "dev": "vite --host",
    "build": "node node_modules/vite/bin/vite.js build",
    "lint": "eslint .",
    "preview": "vite preview",
    "start": "node server.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "lucide-react": "^0.344.0",
    "mongoose": "^8.2.1",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.22.3",
    "@types/react": "^18.2.66",
    "@types/react-dom": "^18.2.22",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.18",
    "postcss": "^8.4.35",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.2.2",
    "vite": "^5.2.0",
    "jsonwebtoken": "^9.0.2",
    "cookie-parser": "^1.4.6",
    "zod": "^3.22.4"
  }
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ESTRUTURA DO PROJETO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- App.tsx
- components
  - AISuggestion.tsx
  - App.tsx
  - AuthForm.tsx
  - BaccaratGame.tsx
  - BlackjackGame.tsx
  - CardComponent.tsx
  - Dashboard.tsx
  - GameControls.tsx
  - MinesGame.tsx
  - TigerGame.tsx
  - UI
    - AchievementToast.tsx
    - Avatar.tsx
    - Button.tsx
    - Notification.tsx
    - ProvablyFairModal.tsx
  - UserProfile.tsx
  - WalletModal.tsx
- config
  - index.js
- controllers
  - authController.js
  - gameController.js
  - userController.js
- dist
  - assets
    - aviator.png
    - baccarat.png
    - blackjack.png
    - BlackjackGame-DaDOE9p-.js
    - Dashboard-DlctGCcW.js
    - game-utils-DO_100NR.js
    - index-BKJjGk20.css
    - index-DnzaA2ZF.js
    - mines.png
    - MinesGame-_mCcxoRS.js
    - ProvablyFairModal-tI8OGwCX.js
    - roulette.png
    - tiger.png
    - TigerGame-aUzKsmg7.js
    - UserProfile-BurppzUo.js
    - vendor-react-CDsKD82O.js
    - vendor-ui-CR_zU9_g.js
  - index.html
- engine
  - baccaratRules.js
  - games
    - BaccaratEngine.js
    - BlackjackEngine.js
    - MinesEngine.js
    - TigerEngine.js
  - index.js
  - modules
    - AchievementSystem.js
    - RiskEngine.js
    - TransactionManager.js
- generatePromptHandoff.js
- gitignore.txt
- hooks
  - useBaccaratLogic.ts
  - useBlackjackLogic.ts
  - useMinesLogic.ts
  - UserProfile.tsx
  - useTigerLogic.ts
- index.css
- index.html
- index.tsx
- metadata.json
- middleware
  - index.js
- models
  - index.js
- package-lock.json
- package.json
- postcss.config.js
- public
  - assets
    - aviator.png
    - baccarat.png
    - banner-tiger.png
    - banner-vip.png
    - blackjack.png
    - mines.png
    - roulette.png
    - tiger.png
- README.md
- routes.js
- server.js
- services
  - database.ts
  - gameLogic.ts
  - index.js
- tailwind.config.js
- tsconfig.json
- types.ts
- utils
  - index.js
- vite.config.ts


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
<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1cxf9idhUbyXarVwz6pl5rgk6Whwot8Jy

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSTRUÇÃO FINAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Antes de sugerir QUALQUER alteração:
- Absorva todo o contexto acima
- Entenda o sistema como um TODO
- Identifique pontos críticos
- Priorize segurança, consistência e produção real