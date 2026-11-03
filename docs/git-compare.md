# Git Compare

Git Compare is a local tool that shows how Flowview documents changed between two
revisions of a git clone: two commits, branches, tags or pull requests. It uses the
same side-by-side compare view as the Workbench's **Preview Agent Updates** dialog
(see `docs/folder-agent-session.md`): Before on the left, After on the right, a list
of changes beside them, **Focused** by default with a **Full diagram** toggle.

It runs only on your machine. It reads a clone you already have and uses the `gh`
CLI's existing sign-in for pull request names; nothing is uploaded.

## Start it

Run the build once in this Flowview checkout (the server assembles its viewer from the
build's generated files), then start the server:

```
python3 tools/build.py
node --max-semi-space-size=1 tools/compare/serve.mjs --repo <path to a local clone> [--port <n>]
```

The server prints `Git Compare: http://127.0.0.1:<port>/`; open that address. Without
`--port` it picks a free port. The flag keeps the server's memory flat under repeated
comparisons; the server also works without it.

Requirements: Node, Python 3 (for the build), `git`, and a local clone of a repository that holds
`*.spec.json` documents. For pull request names and the **Pull requests** list, sign in
once with `gh auth login`; the page header says whether `gh` is signed in. The clone
path and the time of the last fetch are shown in the header too.

## Use it

1. Choose a **Document**, or **All changed documents**.
2. Choose **From (before)** and **To (after)**. Each picker lists the revisions of the
   document, all commits, branches, tags and pull requests, 100 per page (**Show more**
   loads the next page). Search matches the subject, branch, tag, PR number, author or SHA. A commit row shows the commit's
   date, first message line, short SHA and author; a pull request row shows the pull
   request's title and the date it was last updated. **Swap** exchanges From and To.
3. Press **Compare**. The compare view shows the changes of the chosen document; with
   **All changed documents** it first lists the changed documents (Added, Removed,
   Edited, or "Edited · imported content" when only an imported provider changed), and
   choosing one shows its changes.
4. **Between these revisions** lists the commits after From up to To that change the
   document, newest first. **Compare this commit** compares a commit with its first
   parent (for a merge: the branch it was merged into).

Changing From, To or the document removes the shown comparison and asks you to press
**Compare** again. **Fetch** runs `git fetch` for the clone's `origin` remote.

## What it does to the clone

No request changes the working tree, local branches or tags. **Fetch** downloads new
objects from `origin`, updates and prunes the `origin` remote-tracking refs
(`refs/remotes/origin/*`) and rewrites `.git/FETCH_HEAD`, whose time the header shows as
the last fetch. Choosing a pull
request whose commits are not in the clone fetches those commits as objects only, without creating a ref.

## Safety

- The server listens on `127.0.0.1` only and serves a fixed list of files and API
  routes. A request must carry this server's `Host`, and a request with an `Origin`
  must come from this server.
- The `gh` token stays in the server process; the page never receives it.
- For each comparison the page receives the chosen document's JSON at both revisions
  and, when that document has a canon id, the JSON of every spec with a canon id at
  those revisions (the viewer uses them to resolve imported nodes). The page runs only
  in your browser on this machine.
- Text from git and GitHub (commit messages, author, branch, tag and pull request
  names, file names, document content) is shown as plain text, never as HTML. The
  page's Content-Security-Policy allows scripts only from the server.
