# Deploy sem impactar producao

Este projeto deve ser publicado com releases separadas e dados compartilhados. Assim uma correcao nova nao sobrescreve banco, projetos ou traducoes, e o rollback e imediato.

## Estrutura no servidor

```text
/var/www/nodepanel/
  current -> /var/www/nodepanel/releases/20260430120000
  releases/
    20260430120000/
    20260430123000/
  shared/
    server/
      .env
      database.db
      projects/
      translations/
```

## Primeiro deploy

No servidor, copie o codigo novo para uma pasta temporaria, por exemplo:

```bash
/tmp/nodepanel-deploy
```

Depois rode:

```bash
cd /tmp/nodepanel-deploy
bash scripts/deploy-release.sh /var/www/nodepanel
```

O script cria uma nova release, instala dependencias, roda `node --check`, gera `client/dist`, aponta `current` para a release nova e reinicia o PM2.

Para validar a aplicacao automaticamente depois do restart:

```bash
cd /tmp/nodepanel-deploy
HEALTH_URL=https://console.wrodrigues.dev.br/api/health bash scripts/deploy-release.sh /var/www/nodepanel
```

Se a checagem falhar, o script volta o link `current` para a release anterior.

## Proximas correcoes

Para publicar uma correcao:

```bash
cd /tmp/nodepanel-deploy
bash scripts/deploy-release.sh /var/www/nodepanel
```

Antes da troca, a producao continua rodando a release antiga. Se o build falhar, o script para e nao muda o `current`.

## Rollback

Para voltar para a release anterior:

```bash
bash /var/www/nodepanel/current/scripts/rollback-release.sh /var/www/nodepanel
```

Ou escolha uma release especifica:

```bash
bash /var/www/nodepanel/current/scripts/rollback-release.sh /var/www/nodepanel /var/www/nodepanel/releases/20260430120000
```

## Configuracao obrigatoria

Mantenha o dominio em:

```env
APP_BASE_URL=https://console.wrodrigues.dev.br
```

Esse valor fica em:

```text
/var/www/nodepanel/shared/server/.env
```

No GitHub OAuth App, o callback precisa ser:

```text
https://console.wrodrigues.dev.br/git/oauth/github/callback
```
