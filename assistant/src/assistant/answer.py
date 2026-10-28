# Phase 2: answer a question from the retrieved doc chunks, with citations (the "G" in RAG).
import os
import sys

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableParallel, RunnablePassthrough
from langchain_openai import ChatOpenAI
from langfuse import get_client, propagate_attributes
from langfuse.langchain import CallbackHandler

from assistant.retrieve import retriever  # importing loads .env and the saved index

SYSTEM_PROMPT = """You are the assistant of DartLead, an app for running darts tournaments and leagues.

Answer the question using ONLY the numbered sources below. After each fact, cite its source like [1] or [2][3].
If the sources do not contain the answer, say you don't know based on the DartLead docs, and do not guess.
Answer in the same language as the question. Be brief.

Sources:
{context}"""

prompt = ChatPromptTemplate.from_messages([("system", SYSTEM_PROMPT), ("human", "{question}")])
# OpenRouter speaks the OpenAI API, so any model it hosts can write the answer. The model only sees text,
# so it is independent of the embedding model (which must stay the same as the index).
model = ChatOpenAI(
    model=os.environ["ANSWER_MODEL"],
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ["OPENROUTER_API_KEY"],
    name="write-answer",
)


def format_sources(docs) -> str:
    # Numbered so the model can cite them; the number maps back to a file and section for the user.
    return "\n\n".join(f"[{i}] {d.metadata['source']} > {d.metadata.get('section', '(intro)')}\n{d.page_content}"
                       for i, d in enumerate(docs, 1))


# question -> {docs, question} -> + context -> + answer. Keeping docs in the output lets us list the sources.
chain = (
    RunnableParallel(docs=retriever, question=RunnablePassthrough())
    .assign(context=lambda x: format_sources(x["docs"]))
    .assign(answer=prompt | model | StrOutputParser())
)


def main() -> None:
    question = " ".join(sys.argv[1:]) or "What happens if I end my turn on 1?"
    with propagate_attributes(trace_name="answer-question", tags=["phase-2"]):
        result = chain.invoke(question, config={"callbacks": [CallbackHandler()], "run_name": "answer-question"})
    print(result["answer"])
    print("\nSources:")
    for i, d in enumerate(result["docs"], 1):
        print(f"  [{i}] {d.metadata['source']} > {d.metadata.get('section', '(intro)')}")
    get_client().shutdown()  # short-lived script: send queued traces before exiting
