# API Endpoints for FlashCards

## Base URL

- **Development**: `http://localhost:3000`
- **Production**: `https://flashcards-app.onrender.com`

## Authentication

Most endpoints require a JWT token in the `Authorization` header:

```
Authorization: Bearer <JWT_TOKEN>
```

Tokens are obtained via login endpoint and should be stored in HttpOnly cookies or localStorage.

---

## Authentication Endpoints

### POST /api/auth/register

Register a new user account.

**Request:**

```json
{
  "username": "newuser",
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "fullName": "John Doe"
}
```

**Success Response (201):**

```json
{
  "success": true,
  "message": "User registered successfully",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "newuser",
    "email": "user@example.com",
    "fullName": "John Doe",
    "created_at": "2024-10-29T10:40:08Z"
  }
}
```

**Error Responses:**

- `400`: Invalid input (missing fields, weak password)
- `409`: Username or email already exists

**Validation Rules:**

- Username: 3-50 characters, alphanumeric + underscore
- Email: Valid email format
- Password: Min 8 characters, at least 1 uppercase, 1 number, 1 special char

---

### POST /api/auth/login

Authenticate user and receive JWT token.

**Request:**

```json
{
  "username": "newuser",
  "password": "SecurePassword123!"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "newuser",
    "fullName": "John Doe"
  }
}
```

**Error Responses:**

- `400`: Missing username or password
- `401`: Invalid username or password
- `429`: Too many login attempts (rate limited)

**Token Expiration:**

- Default: 7 days
- Can be configured via JWT_EXPIRE env var
- Client should handle token refresh or re-login

---

### POST /api/auth/logout

Invalidate current session.

**Request:**

```
Authorization: Bearer <TOKEN>
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Logout successful"
}
```

**Implementation Note:**

- If using server-side sessions: blacklist token
- If using stateless JWT: just remove client-side token

---

### POST /api/auth/refresh

Refresh an expired JWT token.

**Request:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Success Response (200):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": "7d"
}
```

**Error Responses:**

- `401`: Invalid or expired token

---

## User Profile Endpoints

### GET /api/profile

Get current user's profile information.

**Request:**

```
Authorization: Bearer <TOKEN>
```

**Success Response (200):**

```json
{
  "user": {
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "newuser",
    "email": "user@example.com",
    "fullName": "John Doe",
    "created_at": "2024-10-29T10:40:08Z",
    "updated_at": "2024-10-29T10:40:08Z"
  }
}
```

---

### PUT /api/profile

Update user profile information.

**Request:**

```json
{
  "fullName": "Jane Doe",
  "email": "newemail@example.com",
  "currentPassword": "SecurePassword123!",
  "newPassword": "NewPassword456!"
}
```

**Notes:**

- `currentPassword` required if changing password
- Email must be unique across system
- Can update any field independently

**Success Response (200):**

```json
{
  "success": true,
  "message": "Profile updated successfully",
  "user": {
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "newuser",
    "email": "newemail@example.com",
    "fullName": "Jane Doe",
    "updated_at": "2024-10-29T11:00:00Z"
  }
}
```

**Error Responses:**

- `400`: Invalid input or current password incorrect
- `409`: New email already in use

---

## Flashcard Endpoints

### POST /api/cards

Create a new flashcard.

**Request:**

```json
{
  "question": "What is the capital of France?",
  "answer": "Paris",
  "category": "Geography",
  "difficulty": 2
}
```

**Success Response (201):**

```json
{
  "success": true,
  "card": {
    "card_id": "660e8400-e29b-41d4-a716-446655440001",
    "question": "What is the capital of France?",
    "answer": "Paris",
    "category": "Geography",
    "difficulty": 2,
    "created_at": "2024-10-29T10:40:08Z",
    "updated_at": "2024-10-29T10:40:08Z"
  }
}
```

**Validation:**

- `question`: Required, max 1000 characters
- `answer`: Required, max 5000 characters
- `category`: Optional, max 100 characters
- `difficulty`: 1-5 (default: 2)

---

### GET /api/cards

List all user's flashcards.

**Query Parameters:**

- `category`: Filter by category (optional)
- `difficulty`: Filter by difficulty (optional)
- `page`: Pagination page (default: 1)
- `limit`: Items per page (default: 20, max: 100)

**Request:**

```
GET /api/cards?category=Geography&page=1&limit=20
Authorization: Bearer <TOKEN>
```

**Success Response (200):**

```json
{
  "cards": [
    {
      "card_id": "660e8400-e29b-41d4-a716-446655440001",
      "question": "What is the capital of France?",
      "answer": "Paris",
      "category": "Geography",
      "difficulty": 2,
      "created_at": "2024-10-29T10:40:08Z",
      "updated_at": "2024-10-29T10:40:08Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "pages": 3
  }
}
```

---

### GET /api/cards/:cardId

Get a specific flashcard.

**Request:**

```
Authorization: Bearer <TOKEN>
```

**Success Response (200):**

```json
{
  "card": {
    "card_id": "660e8400-e29b-41d4-a716-446655440001",
    "question": "What is the capital of France?",
    "answer": "Paris",
    "category": "Geography",
    "difficulty": 2,
    "created_at": "2024-10-29T10:40:08Z",
    "updated_at": "2024-10-29T10:40:08Z"
  }
}
```

**Error Response:**

- `404`: Card not found or not owned by user

---

### PUT /api/cards/:cardId

Update a flashcard.

**Request:**

```json
{
  "question": "What is the capital of Germany?",
  "difficulty": 3
}
```

**Success Response (200):**

```json
{
  "success": true,
  "card": {
    "card_id": "660e8400-e29b-41d4-a716-446655440001",
    "question": "What is the capital of Germany?",
    "answer": "Paris",
    "category": "Geography",
    "difficulty": 3,
    "updated_at": "2024-10-29T11:00:00Z"
  }
}
```

---

### DELETE /api/cards/:cardId

Delete a flashcard.

**Request:**

```
Authorization: Bearer <TOKEN>
```

**Success Response (204):**

```
No content
```

**Error Response:**

- `404`: Card not found

---

## Practice Mode Endpoints

### POST /api/practice/start

Start a new practice session.

**Request:**

```json
{
  "sessionType": "daily",
  "cardLimit": 10,
  "categoryFilter": "Geography"
}
```

**Session Types:**

- `daily`: Study cards due today (default)
- `all`: Study all cards
- `category`: Study specific category
- `new`: Study only new cards

**Success Response (200):**

```json
{
  "sessionId": "session-550e8400",
  "cardCount": 8,
  "sessionType": "daily",
  "startedAt": "2024-10-29T10:40:08Z"
}
```

---

### GET /api/practice/:sessionId/card

Get next card for practice in current session.

**Request:**

```
Authorization: Bearer <TOKEN>
```

**Success Response (200):**

```json
{
  "card": {
    "card_id": "660e8400-e29b-41d4-a716-446655440001",
    "question": "What is the capital of France?",
    "difficulty": 2
  },
  "cardNumber": 1,
  "cardCount": 8,
  "sessionProgress": "1/8"
}
```

**Note:** Answer is NOT returned; user must answer from memory

---

### POST /api/practice/:sessionId/answer

Submit answer for current card in Leitner Box system.

**Request:**

```json
{
  "cardId": "660e8400-e29b-41d4-a716-446655440001",
  "correct": true
}
```

**Parameters:**

- `cardId`: The card being answered
- `correct`: Boolean - whether the answer was correct

**Success Response (200):**

```json
{
  "success": true,
  "feedback": {
    "correct": true,
    "answer": "Paris"
  },
  "boxUpdate": {
    "boxNumber": 2,
    "promotion": true,
    "message": "Great! Card promoted to Box 2 (Every 2 days)"
  },
  "schedule": {
    "nextReview": "2024-10-31T10:40:08Z",
    "reviewInterval": "2 days"
  },
  "progress": {
    "box1Count": 5,
    "box2Count": 8,
    "box3Count": 3,
    "totalCards": 16
  }
}
```

**If Answer Incorrect (Demotion):**

```json
{
  "success": true,
  "feedback": {
    "correct": false,
    "correctAnswer": "Paris",
    "yourAnswer": "Rome"
  },
  "boxUpdate": {
    "boxNumber": 1,
    "demotion": true,
    "message": "Demoted to Box 1 - Review Daily"
  },
  "schedule": {
    "nextReview": "2024-10-30T10:40:08Z",
    "reviewInterval": "1 day"
  }
}
```

**Leitner Box Rules:**

- **Correct Answer**: Card promoted to next box (max Box 3)
  - Box 1 → Box 2: Next review in 2 days
  - Box 2 → Box 3: Next review in 7 days
  - Box 3 → Box 3: Next review in 7 days (mastered)

- **Incorrect Answer**: Card demoted back to Box 1
  - All boxes → Box 1: Next review tomorrow
  - Aggressive drilling of weak concepts

---

### POST /api/practice/:sessionId/end

End current practice session and get summary.

**Request:**

```json
{
  "sessionFeedback": "optional feedback"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "sessionSummary": {
    "sessionId": "session-550e8400",
    "duration": 600,
    "totalCards": 8,
    "correctCount": 7,
    "accuracy": 87.5,
    "cardsReviewedToday": 8,
    "cardsDueNext": 3,
    "sessionStarted": "2024-10-29T10:40:08Z",
    "sessionEnded": "2024-10-29T10:50:08Z"
  }
}
```

---

## Quiz Endpoints

### POST /api/quizzes

Create a new quiz from existing cards.

**Request:**

```json
{
  "name": "Chapter 3 Vocabulary",
  "description": "Test vocab from chapter 3",
  "cardIds": ["660e8400-e29b-41d4-a716-446655440001", "660e8400-e29b-41d4-a716-446655440002"]
}
```

**Success Response (201):**

```json
{
  "success": true,
  "quiz": {
    "quiz_id": "770e8400-e29b-41d4-a716-446655440001",
    "name": "Chapter 3 Vocabulary",
    "description": "Test vocab from chapter 3",
    "questionCount": 2,
    "created_at": "2024-10-29T10:40:08Z"
  }
}
```

---

### GET /api/quizzes

List all user's quizzes.

**Query Parameters:**

- `page`: Pagination page (default: 1)
- `limit`: Items per page (default: 20)

**Success Response (200):**

```json
{
  "quizzes": [
    {
      "quiz_id": "770e8400-e29b-41d4-a716-446655440001",
      "name": "Chapter 3 Vocabulary",
      "description": "Test vocab from chapter 3",
      "questionCount": 2,
      "lastTaken": "2024-10-28T15:30:00Z",
      "attempts": 3,
      "bestScore": 95
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5
  }
}
```

---

### GET /api/quizzes/:quizId

Get specific quiz details.

**Success Response (200):**

```json
{
  "quiz": {
    "quiz_id": "770e8400-e29b-41d4-a716-446655440001",
    "name": "Chapter 3 Vocabulary",
    "description": "Test vocab from chapter 3",
    "questions": [
      {
        "order": 1,
        "cardId": "660e8400-e29b-41d4-a716-446655440001",
        "question": "What is the capital of France?"
      }
    ],
    "created_at": "2024-10-29T10:40:08Z"
  }
}
```

---

### POST /api/quizzes/:quizId/take

Start taking a quiz.

**Request:**

```
Authorization: Bearer <TOKEN>
```

**Success Response (200):**

```json
{
  "attemptId": "attempt-660e8400",
  "quiz": {
    "quiz_id": "770e8400-e29b-41d4-a716-446655440001",
    "name": "Chapter 3 Vocabulary",
    "questionCount": 10
  },
  "firstQuestion": {
    "questionNumber": 1,
    "question": "What is the capital of France?"
  }
}
```

---

### POST /api/quizzes/:quizId/answer

Submit answer to quiz question.

**Request:**

```json
{
  "attemptId": "attempt-660e8400",
  "questionNumber": 1,
  "answer": "Paris"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "questionNumber": 1,
  "isCorrect": true,
  "correctAnswer": "Paris",
  "nextQuestion": {
    "questionNumber": 2,
    "question": "What is the capital of Germany?"
  }
}
```

---

### POST /api/quizzes/:quizId/submit

Submit completed quiz and get results.

**Request:**

```json
{
  "attemptId": "attempt-660e8400",
  "timeSpent": 300
}
```

**Success Response (200):**

```json
{
  "success": true,
  "results": {
    "result_id": "result-770e8400",
    "quiz_id": "770e8400-e29b-41d4-a716-446655440001",
    "score": 9,
    "totalQuestions": 10,
    "percentage": 90,
    "timeSpent": 300,
    "taken_at": "2024-10-29T10:40:08Z",
    "answers": [
      {
        "questionNumber": 1,
        "question": "What is the capital of France?",
        "userAnswer": "Paris",
        "correctAnswer": "Paris",
        "correct": true
      }
    ]
  }
}
```

---

## Import/Export Endpoints

### POST /api/cards/import

Import flashcards from JSON file.

**Request (Multipart Form Data):**

```
Content-Type: multipart/form-data
Authorization: Bearer <TOKEN>

file: <JSON_FILE>
overwrites: false (optional, default false)
```

**Expected JSON Format:**

```json
{
  "cards": [
    {
      "question": "Q1?",
      "answer": "A1",
      "category": "Cat1",
      "difficulty": 2
    },
    {
      "question": "Q2?",
      "answer": "A2",
      "category": "Cat2",
      "difficulty": 3
    }
  ]
}
```

**Success Response (201):**

```json
{
  "success": true,
  "imported": 2,
  "skipped": 0,
  "errors": [],
  "message": "Successfully imported 2 cards"
}
```

**Error Responses:**

- `400`: Invalid file format
- `413`: File too large
- `422`: Validation errors in cards

---

### GET /api/cards/export

Export all user's flashcards as JSON file.

**Query Parameters:**

- `category`: Export only specific category (optional)
- `format`: json or csv (default: json)

**Request:**

```
GET /api/cards/export?format=json
Authorization: Bearer <TOKEN>
```

**Success Response (200 with file download):**

```
Content-Type: application/json
Content-Disposition: attachment; filename="flashcards_2024-10-29.json"

{
  "exportedAt": "2024-10-29T10:40:08Z",
  "cardCount": 42,
  "cards": [
    {
      "question": "Q1?",
      "answer": "A1",
      "category": "Cat1",
      "difficulty": 2
    }
  ]
}
```

---

## Error Response Format

All error responses follow this format:

```json
{
  "success": false,
  "error": "Error message for user",
  "errorCode": "ERROR_CODE",
  "details": {
    "field": "Specific validation error if applicable"
  },
  "timestamp": "2024-10-29T10:40:08Z"
}
```

**Common Error Codes:**

- `INVALID_INPUT`: Validation failed
- `UNAUTHORIZED`: Missing or invalid token
- `FORBIDDEN`: User lacks permission
- `NOT_FOUND`: Resource doesn't exist
- `CONFLICT`: Resource already exists
- `RATE_LIMITED`: Too many requests
- `INTERNAL_ERROR`: Server error

---

## Rate Limiting

- **Login**: 5 attempts per 15 minutes
- **API Calls**: 100 requests per minute (per user)
- **File Upload**: 50 MB max file size

---

## Pagination

All list endpoints support pagination:

**Query Parameters:**

- `page`: Page number (default: 1, min: 1)
- `limit`: Items per page (default: 20, max: 100)

**Response Structure:**

```json
{
  "items": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "pages": 3,
    "hasNext": true,
    "hasPrev": false
  }
}
```
