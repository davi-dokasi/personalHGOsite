# daviafsilva — portfólio

Site pessoal de **Davi Augusto**, cientista de dados e estudante de Estatística na UFRGS.
Feito com [Hugo](https://gohugo.io/) (tema próprio, sem Bootstrap/jQuery), bilíngue
(português na raiz, inglês em `/en/`) e publicado na Netlify a cada push no `main`.

## Rodando localmente

1. Instale o Hugo **extended** (uma vez):
   ```powershell
   winget install Hugo.Hugo.Extended
   ```
2. Na pasta do projeto:
   ```powershell
   hugo server
   ```
3. Abra <http://localhost:1313>. O site recarrega sozinho quando você salva um arquivo.

A versão usada na Netlify fica em `netlify.toml` (`HUGO_VERSION`). Se atualizar o Hugo na
sua máquina, atualize lá também.

## Onde editar cada coisa

Quase todo o conteúdo fica em arquivos de dados, com os dois idiomas lado a lado
(`pt:` / `en:`). Não é preciso mexer em HTML para atualizar o site.

| O quê | Arquivo |
|---|---|
| Nome, e-mail, links, foto, PDFs do CV, linha "Atualmente" | `data/profile.yaml` |
| Texto "Sobre mim" e a ficha `davi.info()` | `data/about.yaml` |
| Ferramentas (chips) | `data/skills.yaml` |
| Experiências (alimenta os cards e a linha do tempo) | `data/experience.yaml` |
| Projetos em destaque, cards e lista do GitHub | `data/projects.yaml` |
| Graduação, cursos e foto da seção Formação | `data/education.yaml` |
| Textos fixos da interface (menu, botões, títulos) | `i18n/pt.yaml` e `i18n/en.yaml` |
| Título e descrição do site (SEO) | `hugo.toml` |

Dicas:

- **Novo emprego:** adicione um item no topo de `data/experience.yaml` e deixe `end: ""`
  no emprego atual. A linha do tempo se ajusta sozinha.
- **Atualizar o currículo:** substitua os PDFs em `static/cv/`, mantendo os nomes.
- **Números dos projetos** (`stats`) são numéricos de propósito: o site formata
  `171769` como "171.769" em português e "171,769" em inglês.

## Escrevendo um post

```powershell
hugo new content blog/nome-do-post/index.md
```

Cada post é uma pasta: o texto fica em `index.md` e as imagens ficam ao lado, citadas pelo
nome (`![descrição](grafico.png)`). No cabeçalho do arquivo:

- `draft: true` esconde o post até você mudar para `false`;
- `math: true` ativa fórmulas com `$$ ... $$` (KaTeX);
- `toc: true` mostra o sumário lateral;
- `cover.image` define a capa (1200×630 fica ótimo também para o preview no LinkedIn).

Posts escritos só em português aparecem também na versão em inglês do blog, com um aviso.

## Publicação (Netlify)

- `git push` no `main` → a Netlify roda `hugo --gc --minify` e publica a pasta `public/`.
- Branches e pull requests ganham um link de pré-visualização próprio.
- Os endereços do site antigo (`/blogs/...`) redirecionam para os novos (`/blog/...`),
  configurado em `netlify.toml`.
- O `baseURL` em `hugo.toml` é `https://daviafsilva.netlify.app/`. Se conectar um domínio
  próprio (ex.: `daviafsilva.com`), troque o `baseURL` e configure o domínio no painel da
  Netlify.

## Estrutura

```
assets/css/main.css      design system (cores, tipografia, temas claro/escuro)
assets/js/main.js        tema, menu, animações de rolagem, copiar e-mail, blog
assets/js/lab.js         laboratório interativo (regressão linear + k-means) do topo
assets/js/math.js        renderização das fórmulas (KaTeX)
content/                 páginas e posts (Markdown)
data/                    conteúdo do site (YAML, PT/EN)
i18n/                    textos da interface
layouts/                 templates HTML do Hugo
static/                  arquivos servidos como estão (fotos, CVs, ícones, og.png)
```

As cores dos gráficos foram validadas para daltonismo (protanopia/deuteranopia) nos dois
temas, e os textos têm contraste mínimo de 4,5:1 (WCAG AA). O laboratório respeita a
preferência "reduzir movimento" do sistema.
