# BySync CEO Command Center

The CEO workspace is part of the existing BySync application and uses the same Supabase Auth users, profiles, projects, tasks, events and messages.

## Activate the database changes

Run the migrations in numeric order in the linked Supabase project. The CEO workspace specifically requires:

- `supabase/migrations/010_productivity_suite.sql`
- `supabase/migrations/011_ceo_management.sql`
- `supabase/migrations/012_executive_operations.sql`

Migration 011 creates the protected executive audit trail and CEO RLS helper. Audit writes are service-role only through authorized server routes.
Migration 012 adds milestones, risks, task dependencies/collaborators, blocker reasons, effort estimates, capacity planning and optimistic task versions.

## Designate a CEO

1. Sign in with an existing workspace administrator.
2. Open **Team**.
3. Open the member management dialog for the intended account.
4. Select **CEO** as the workspace role and save.
5. Ask the user to sign out and sign in again so Supabase issues a JWT containing the updated trusted `app_metadata.role` claim.

The role is stored in Supabase Auth `app_metadata`, not local storage or editable user metadata. Do not set a CEO role from browser code.

## Routing and authorization

- `/` sends a CEO to `/ceo/dashboard`; other authenticated users continue to `/dashboard`.
- Every `/ceo/*` page checks the authenticated server session in the CEO layout.
- `/api/ceo/overview` and `/api/ceo/tasks` independently verify the CEO role.
- Employees attempting direct CEO URLs are redirected to the employee dashboard.
- CEO-created tasks use `project_tasks`, so assigned employees see the same records in existing project/dashboard views.

## Metric definitions

- **Completed:** task is in a column whose name contains done, complete or closed.
- **In progress:** task is in a column whose name contains progress, doing or active.
- **Blocked:** task is in a column whose name contains block, stuck or hold.
- **Overdue:** incomplete task with a due date earlier than the current time.
- **Completion rate:** completed tasks divided by all non-archived-project tasks.
- **Workload:** count of active assigned tasks. It is explicitly presented as an approximate task-count signal, not a performance score.
- **Project health:** starts at 100 and deducts 12 per overdue task, 15 per blocked task and 18 per high/critical open risk. 75–100 is healthy, 50–74 is at risk and below 50 is critical.
- **Capacity:** estimated active-task hours divided by configured weekly capacity. If either value is missing, the UI clearly falls back to task-count indicators.

For the clearest analytics, use consistent project column names such as **To do**, **In progress**, **Blocked**, and **Done**.
