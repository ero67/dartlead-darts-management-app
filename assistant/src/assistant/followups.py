# Suggests next questions after an answer. Best effort: the caller decides what a failure means.
from dotenv import load_dotenv

load_dotenv()  # before importing Langfuse, which reads its keys from the environment

from langchain_google_genai import ChatGoogleGenerativeAI  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from assistant.prompts import template  # noqa: E402

MAX_QUESTIONS = 3
MAX_LENGTH = 80  # a chip on a phone screen
MAX_ANSWER = 4000
TIMEOUT = 3  # seconds the stream waits for suggestions
MODEL_TIMEOUT = 10  # Gemini refuses a deadline under 10 s; an abandoned call still ends by itself


class Followups(BaseModel):
    """Questions the user may want to ask next."""

    questions: list[str] = Field(description="Up to 3 short follow-up questions. Empty if none fit.")


FOLLOWUPS_PROMPT = """You suggest what the user may ask next in DartLead, an app for running darts tournaments and leagues.

Suggest up to 3 short next questions that follow from the answer below, written in {language}.

- Only suggest what the assistant can answer: player stats and form, head-to-head, league tables, tournaments, records
  across players, the user's own practice, darts rules and how to use the app.
- Write each one as the user would ask it, in the first person where it fits.
- If the answer asks the user something or says it cannot answer, return none."""

model = ChatGoogleGenerativeAI(model="gemini-3.5-flash-lite", name="suggest-followups", timeout=MODEL_TIMEOUT, max_retries=0)
structured = model.with_structured_output(Followups)


def clean(questions: list[str]) -> list[str]:
    # The limits hold whatever the model returns; too long is dropped, not cut, so no question ends mid-word.
    stripped = (q.strip() for q in questions)
    return [q for q in stripped if q and len(q) <= MAX_LENGTH][:MAX_QUESTIONS]


def suggest(question: str, answer: str, language: str, config: dict) -> list[str]:
    # Built per call so the prompt is the Langfuse one (SDK-cached).
    prompt = template("followups", FOLLOWUPS_PROMPT, human="Question: {question}\n\nAnswer: {answer}")
    result = (prompt | structured).invoke(
        {"question": question, "answer": answer[:MAX_ANSWER], "language": language}, config=config)
    return clean(result.questions)
