# Self-hosted AI quizzes

Kuppi’s quiz generator never exposes the OpenRouter credential to browsers. Set the following variable only in the environment of the server that runs Kuppi:

```bash
OPENROUTER_API_KEY=your_openrouter_key
```

The integration requests `openrouter/free` through OpenRouter’s standard chat-completions endpoint. The server keeps a strict MCQ-only prompt and validates every response before storing a quiz. If the variable is absent, students receive a safe configuration message instead of a failed or partial quiz.

The quiz entry point is shown in signed-in PDF and image previews. For the most reliable question quality, resource authors should include a precise, factual description when sharing their file; the current generator uses the resource title, subject, study level, and student-provided description as its verified source context.
