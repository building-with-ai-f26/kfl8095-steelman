-- Boards in a space (G-04, G-05, M3d-18; plans/architecture.md §2, the board
-- table's space_id, and §7, point 4): a board can be in one space, which its
-- Owner puts it in, and can then be shared with everyone in that space at
-- the link's role.
--
-- What the database holds true: a board is in no space, or in one space that
-- exists.
--
-- "Everyone in the space" is a value of general_access, "space", which, like
-- "invited" and "link" (0008), is the service's word and isn't listed here
-- (Q24). That a board's Owner belongs to the space they put it in, that a
-- board shared with its space must be in one, and what a deleted space lets
-- in are the service's rules too.
--
-- Account deletion (architecture §2, the deletion table): a board in a space
-- passes to the space's Owner or an Admin first, who may not be on the board
-- yet, so the deletion role may now add someone to a board, and record that
-- they were added by name, as well as changing a role.
--
-- Additive, so the code already running keeps working (AGENTS.md rule 7).

alter table board add column space_id text references space (id);

-- "Which boards are in this space?", for the list, profiles, and statistics.
create index board_space on board (space_id) where space_id is not null;

grant insert, update (joined_via) on board_member to steelman_account_deletion;
