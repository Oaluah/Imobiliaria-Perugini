# Perugine - sistema web imobiliário

Sistema web para gestão imobiliária, desenvolvido com JavaScript, Express, React/Vite, Prisma e PostgreSQL.

## Funcionalidades implementadas

- Painel com indicadores, imóveis recentes e próximas visitas.
- Carteira de imóveis com busca, filtros, cadastro, edição, fichas e galeria de fotos.
- Cadastro de clientes com perfis, documentos e anexos PDF/imagem organizados por categoria.
- Agenda para marcar, concluir e cancelar visitas.
- Financeiro com contratos de locação, pagamentos mensais, comissão de 10%, repasse de 90% e recibo imprimível.
- Login, criação da conta administradora e permissões por pessoa e por área.
- API REST, validações de entrada e Prisma Studio para consultar o PostgreSQL.
- Banco local via Docker Compose ou PostgreSQL instalado.

A navegação principal reúne essas funções em quatro áreas: visão geral; cadastros (imóveis e clientes); contratos e financeiro; agenda e administração (visitas e equipe).

O sistema é um protótipo local para desenvolvimento acadêmico. O painel destaca cobranças em atraso e vencimentos próximos; reajustes são registrados manualmente com o percentual informado pela equipe. Consulta automática de índices, auditoria e fluxos completos de encerramento de contratos ainda não estão implementados. Use somente dados fictícios. Fotos e documentos ficam em `api/uploads/`, relacionados aos registros do PostgreSQL; essa pasta é ignorada pelo Git.

## Requisitos

- Node.js 22.12 ou superior na linha 22 (detectado: 22.17.1).
- Git (já instalado).
- Docker Desktop para Windows com WSL 2, ou PostgreSQL instalado localmente.




