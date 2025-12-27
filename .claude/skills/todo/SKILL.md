---
name: todo-management
description: Use this skill when working on project tasks, planning work, or when the user asks about todos. Always use todo.md as the source of truth for project tasks.
---

# Project Todo Management

Manage project tasks using the `todo.md` file as the source of truth.

## When to Use This Skill

- When starting a work session on this project
- When the user asks about todos, tasks, or what to work on
- When completing a task (to mark it done)
- When adding new work items

## Instructions

1. **Always use `todo.md` as the source of truth** for project todos
   - The TodoWrite tool is for tracking progress within a single session
   - The `todo.md` file persists across sessions and is version-controlled

2. **Showing todos:**
   - Read `todo.md` and display pending items clearly
   - Group by category if applicable

3. **Adding todos:**
   - Read `todo.md`, add the new item under the appropriate "Pending" section
   - Use `- [ ]` checkbox format for consistency

4. **Completing todos:**
   - Find the matching item in Pending section
   - Move it to the Completed section with `- [x]` format
   - Include any sub-items if applicable

5. **Managing completed items (archiving):**
   - Keep only the **5 most recent** completed items in the Completed section
   - When Completed exceeds 5 items, move older items to an Archive section at the bottom
   - Keep only the **5 most recent** archived items in the Archive section
   - Delete items that fall off the Archive (oldest first)
   - This keeps the todo.md file focused and scannable

6. **Starting work:**
   - Read `todo.md`, identify the task to work on
   - Create a TodoWrite session list to track progress on that item
   - Begin working on it

## Important

When starting any work session on this project, check `todo.md` first to understand pending work and maintain continuity across sessions.
