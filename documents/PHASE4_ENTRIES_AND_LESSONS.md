# Phase 4: Entries & Lesson Tracking

## Overview

Phase 4 introduces flashcard entry management with privacy controls and lesson tracking for better organization.

## Database Changes

### New Tables

- **lessons** - Organize flashcards into lessons for better grouping
  - lesson_id (UUID, PK)
  - user_id (FK to users)
  - name (VARCHAR)
  - description (TEXT)
  - created_at, updated_at (TIMESTAMP)

### Updated Tables

- **flashcards** - Added new columns:
  - lesson (VARCHAR) - Text-based lesson name for simple categorization
  - lesson_id (UUID FK) - Reference to lessons table for structured organization
  - is_public (BOOLEAN, DEFAULT: FALSE) - Privacy control for sharing

## Features

### Privacy Model

- **Private (default)**: Entries visible only to creator
- **Public/Shared**: Entries can be used by other users
- Sharing toggle in entries management interface

### Lesson Organization

- Track lesson/source for each flashcard set
- Two organizational approaches:
  1. Simple: Use lesson column for text-based lesson names
  2. Structured: Create lesson records and reference via lesson_id
- Group cards by lesson for better study organization

### Entry Management (to be implemented)

- Create/read/update/delete entries
- Toggle privacy status
- Assign to lessons
- Search/filter by lesson
- Share with other users
- View shared entries from other users

## API Endpoints (to be implemented)

### Flashcards

- GET /api/flashcards - List user's private + shared cards
- GET /api/flashcards/private - List only private cards
- GET /api/flashcards/shared - List only shared cards
- POST /api/flashcards - Create new card
- PUT /api/flashcards/:id - Update card
- DELETE /api/flashcards/:id - Delete card
- PATCH /api/flashcards/:id/privacy - Toggle privacy

### Lessons

- GET /api/lessons - List user's lessons
- POST /api/lessons - Create lesson
- PUT /api/lessons/:id - Update lesson
- DELETE /api/lessons/:id - Delete lesson
- GET /api/lessons/:id/cards - Get cards in lesson

## Database bootstrap

The schema is initialized through the application database object, which reads the PostgreSQL schema from `src/scripts/sql/pg/flashcards-postgres-schema.sql` and executes it via `FlashCardsDatabase.initializeSchema()`. The legacy one-off lesson-sharing migration script has been removed; the startup path now uses the canonical SQL-file bootstrap instead.

## Next Steps

1. Implement entry management API endpoints
2. Create entries UI with lesson selector
3. Implement sharing mechanism
4. Add lesson management interface
5. Create entries view/list UI
6. Integrate with Leitner system for practice
