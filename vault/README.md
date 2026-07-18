# Rogers Blog Vault

This Obsidian vault is two things layered on top of each other: Rogers Mukiibi's **public blog source** and his **personal second brain**. Claude should read this file before making structural changes to understand which parts are public and which are private.

## Structure

### 📝 Posts
- **Location**: `posts/` folder
- **Purpose**: Published blog posts that appear on the website
- **Format**: Markdown files with frontmatter metadata
- **Git**: tracked and pushed — treat as public

### 📋 Drafts — the actual second brain
- **Location**: `drafts/` folder
- **Git**: **gitignored** — never pushed, never public. This is deliberate: `drafts/Random Notes/Auth.md` and similar files hold real credentials/PINs, so anything under `drafts/` must stay out of version control.
- **Purpose**: this is where Rogers actually works day to day. It is not a "posts staging area" — it's a running personal knowledge base covering daily journaling (`Habit3/Daily Notes/`), work notes (`Auri Notes/`, spanning power engineering and the Cetus Engine / Irradiation Portal projects), the `Xeno` AI project, and general life capture (`Random Notes/`).
- **Format**: messy by design — daily notes, meeting notes, half-formed ideas, letters to self. Blog posts are the rare thing that gets *extracted* from this, not the default output.

## Tagging System

- Every tag in use across the vault is defined in [`drafts/Random Notes/Tags.md`](drafts/Random%20Notes/Tags.md) — treat it as the canonical tag dictionary.
- Convention: **all tags are lowercase**. Before introducing a new tag, check Tags.md first — reuse an existing one if it fits.
- Goal: no captured thought should go untagged. When adding a new tag, add its definition to Tags.md in alphabetical order.

## Writing Workflow

1. **Capture in Drafts**: daily notes, meeting notes, and ideas are captured in `drafts/`, tagged as they're written.
2. **Use Obsidian Features**:
   - Link between notes with `[[note name]]`
   - Tag everything (see Tagging System above)
   - Use templates for consistency
3. **Promote to Posts**: when a draft/daily-note idea is worth publishing, it gets rewritten and moved into `posts/` following the Post Format below.
4. **Update Blog**: The website automatically loads from `vault/posts/`.

## Post Format

Each post should have this structure:

```markdown
---
title: "Your Post Title"
date: 2025-01-01
tags: [web-development, javascript]
excerpt: "Brief description of the post"
type: blog  # or "learning"
---

# Your Post Title

Your content here...
```

## Obsidian Tips

- **Daily Notes**: Great for capturing ideas
- **Graph View**: See connections between posts
- **Templates**: Create post templates for consistency
- **Plugins**: Consider plugins like Calendar, Templater, etc.

## Blog Integration

The blog's JavaScript automatically loads posts from `vault/posts/`. The file structure is:
- Website loads from: `vault/posts/filename.md`
- Post URLs become: `post.html?id=filename`

## Folder Organization

```
vault/
├── posts/           # Published posts
├── drafts/          # Work in progress
├── templates/       # Post templates (optional)
├── assets/          # Images, files (optional)
└── .obsidian/       # Obsidian configuration
```

## Getting Started

1. Open this vault in Obsidian
2. Create new posts in the `drafts/` folder
3. Use the existing posts as examples
4. Move completed posts to `posts/` folder
5. Your blog will automatically show the new posts

Happy writing! 
