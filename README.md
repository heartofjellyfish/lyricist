# songwriter.qi.land

A monorepo of small songwriting tools, all hosted from one Vercel
project. Each tool is a static page + vanilla JS in its own folder,
exposed at its own subdomain.

## Tools

| Tool | URL | Folder |
|---|---|---|
| Landing | https://songwriter.qi.land/ | `landing.html` |
| Stress Lyric Workshop | https://songwriter.qi.land/stress-workshop/ | `stress-workshop/` |
| Line Craft | https://songwriter.qi.land/line-craft/ | `line-craft/` |
| Rhyme Finder | **https://rhyme.qi.land/** | `rhyme-finder/` |

## Local dev

```bash
npm install
npm run dev          # serves at http://localhost:5173/
# open http://localhost:5173/rhyme-finder/  (subdomain rewrites only run on Vercel)
```

## Architecture, gotchas, and the "adding a new tool" runbook

**See [CLAUDE.md](./CLAUDE.md)** for everything that isn't obvious from
the code — how subdomain routing works, why we use absolute paths in
tool HTML, why `node_modules` can't be runtime-imported, the CMU dict
override system, and a step-by-step for adding a new tool + subdomain.

If you (or a model assisting you) are about to make changes here, read
CLAUDE.md first. It captures three classes of bug we already shipped
and fixed; re-breaking them costs hours of debugging.
