"""
rag_pipeline.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BioFin Oracle — RAG (Retrieval-Augmented Generation) Pipeline

PURPOSE
-------
Provides a local knowledge base retrieval system that:
1. Ingests .md files from backend/knowledge_base/ into a persistent ChromaDB
2. Queries the knowledge base based on user-uploaded data context
3. Assembles RAG-enhanced prompt context for LLM calls

INTEGRATION
-----------
Called by the FastAPI sidecar via two new endpoints:
  POST /rag_ingest  — (re)build the ChromaDB from knowledge_base/*.md
  POST /rag_query   — accept aggregated data, return top-k relevant texts

The Next.js route.ts calls /rag_query after aggregating all four categories,
then injects the returned prompt_block into the user prompt before the LLM call.

DEPENDENCIES
------------
  pip install sentence-transformers chromadb
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import chromadb
from sentence_transformers import SentenceTransformer


# ─── Configuration ───────────────────────────────────────────────────────────

KNOWLEDGE_BASE_DIR = Path(__file__).parent / "knowledge_base"
CHROMA_PERSIST_DIR = Path(__file__).parent / "chroma_db"
COLLECTION_NAME = "biofin_knowledge"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
CHUNK_MAX_CHARS = 500
CHUNK_OVERLAP_SENTENCES = 1


# ─── Embedding Model (lazy singleton) ────────────────────────────────────────

_model: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(EMBEDDING_MODEL)
    return _model


def _get_chroma() -> chromadb.PersistentClient:
    return chromadb.PersistentClient(path=str(CHROMA_PERSIST_DIR))


# ─── 1. Knowledge Ingestion ──────────────────────────────────────────────────

def _chunk_markdown(text: str, source: str) -> list[dict[str, Any]]:
    """Split a markdown document into semantically meaningful chunks."""
    sections = re.split(r"(?=^#{1,6}\s)", text, flags=re.MULTILINE)

    chunks: list[dict[str, Any]] = []
    for section in sections:
        section = section.strip()
        if not section:
            continue

        title_match = re.match(r"^#{1,6}\s+(.+)", section)
        section_title = title_match.group(1).strip() if title_match else "Overview"

        if len(section) <= CHUNK_MAX_CHARS:
            chunks.append({
                "text": section,
                "metadata": {"source": source, "section": section_title},
            })
            continue

        # Split long sections by paragraph boundaries
        paragraphs = [p.strip() for p in section.split("\n\n") if p.strip()]
        buf = ""
        for para in paragraphs:
            if len(buf) + len(para) + 2 <= CHUNK_MAX_CHARS:
                buf += ("\n\n" if buf else "") + para
            else:
                if buf:
                    chunks.append({
                        "text": buf,
                        "metadata": {"source": source, "section": section_title},
                    })
                # Single paragraph too long — split by sentences
                if len(para) > CHUNK_MAX_CHARS:
                    sentences = re.split(r"(?<=[.!?])\s+", para)
                    sub = ""
                    for sent in sentences:
                        if len(sub) + len(sent) + 1 <= CHUNK_MAX_CHARS:
                            sub += (" " if sub else "") + sent
                        else:
                            if sub:
                                chunks.append({
                                    "text": sub,
                                    "metadata": {"source": source, "section": section_title},
                                })
                            sub = sent
                    buf = sub
                else:
                    buf = para
        if buf:
            chunks.append({
                "text": buf,
                "metadata": {"source": source, "section": section_title},
            })

    return chunks


def ingest_knowledge_base(force_rebuild: bool = False) -> dict[str, Any]:
    """
    Read all .md files, chunk them, vectorize with sentence-transformers,
    and persist to ChromaDB.

    Set force_rebuild=True to delete the existing collection first.
    """
    model = _get_model()
    client = _get_chroma()

    if force_rebuild:
        try:
            client.delete_collection(COLLECTION_NAME)
        except Exception:
            pass

    collection = client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )

    md_files = sorted(KNOWLEDGE_BASE_DIR.glob("*.md"))
    if not md_files:
        return {"status": "error", "message": f"No .md files found in {KNOWLEDGE_BASE_DIR}"}

    total_chunks = 0
    sources: list[dict[str, Any]] = []

    for md_file in md_files:
        source_name = md_file.stem
        text = md_file.read_text(encoding="utf-8")
        if not text.strip():
            continue

        file_chunks = _chunk_markdown(text, source_name)
        if not file_chunks:
            continue

        texts = [c["text"] for c in file_chunks]
        embeddings = model.encode(texts, show_progress_bar=False).tolist()
        ids = [f"{source_name}_chunk_{i}" for i in range(len(file_chunks))]

        collection.upsert(
            ids=ids,
            documents=texts,
            embeddings=embeddings,
            metadatas=[c["metadata"] for c in file_chunks],
        )

        total_chunks += len(file_chunks)
        sources.append({"source": source_name, "chunks": len(file_chunks), "chars": len(text)})

    return {
        "status": "success",
        "collection": COLLECTION_NAME,
        "total_chunks": total_chunks,
        "sources": sources,
    }


def ensure_knowledge_base() -> None:
    """Auto-ingest on startup if the collection is empty."""
    client = _get_chroma()
    try:
        collection = client.get_collection(COLLECTION_NAME)
        if collection.count() > 0:
            return
    except Exception:
        pass
    ingest_knowledge_base(force_rebuild=True)


# ─── 2. Retrieval & Assembly ─────────────────────────────────────────────────

def extract_key_information(aggregated_data: dict[str, Any]) -> str:
    """
    Build a semantic query string from the four-category aggregated data.
    This query is sent to ChromaDB to find the most relevant industry guidelines.
    """
    parts: list[str] = []

    # --- Environment ---
    env = aggregated_data.get("env_geo") or {}
    env_hist = env.get("historical_summary", {})
    env_stats = env_hist.get("statistics", {})

    temp = env_stats.get("temperature", {})
    if temp:
        parts.append(f"average temperature {temp.get('mean', '?')}°C")
    rainfall = env_stats.get("rainfall_mm", {})
    if rainfall:
        parts.append(f"rainfall {rainfall.get('mean', '?')} mm")
    soil_ph = env_stats.get("soil_ph", {})
    if soil_ph:
        parts.append(f"soil pH {soil_ph.get('mean', '?')}")
    moisture = env_stats.get("soil_moisture", {})
    if moisture:
        parts.append(f"soil moisture {moisture.get('mean', '?')}%")

    # --- Crop ---
    crop = aggregated_data.get("bio_crop") or {}
    crop_hist = crop.get("historical_summary", {})
    varieties = crop_hist.get("crop_varieties", [])
    if varieties:
        parts.append(f"crop variety {', '.join(varieties[:3])}")

    # --- Operations ---
    ops = aggregated_data.get("operations") or {}
    ops_hist = ops.get("historical_summary", {})
    if ops_hist.get("fertilizer_events"):
        parts.append(f"fertilizer applied {ops_hist['fertilizer_events']} times")
    if ops_hist.get("pesticide_events"):
        parts.append(f"pesticide applied {ops_hist['pesticide_events']} times")

    # --- Financial ---
    fin = aggregated_data.get("financial") or {}
    fin_hist = fin.get("historical_summary", {})
    price = fin_hist.get("price_stats", {})
    if price:
        parts.append(f"price RM {price.get('mean', '?')}/kg")
    volatility = fin_hist.get("price_volatility_pct", 0)
    if volatility and volatility > 15:
        parts.append(f"high price volatility {volatility}%")

    # Fallback
    if not parts:
        return "Malaysian oil palm cultivation climate suitability financial assessment"

    return "Malaysian agriculture " + ", ".join(parts)


def query_knowledge_base(query: str, top_k: int = 3) -> list[dict[str, Any]]:
    """
    Query ChromaDB and return the top-k most relevant chunks.
    Auto-ingests if the collection is missing.
    """
    model = _get_model()
    client = _get_chroma()

    try:
        collection = client.get_collection(COLLECTION_NAME)
    except Exception:
        ingest_knowledge_base(force_rebuild=True)
        collection = client.get_collection(COLLECTION_NAME)

    count = collection.count()
    if count == 0:
        return []

    query_embedding = model.encode([query], show_progress_bar=False).tolist()

    results = collection.query(
        query_embeddings=query_embedding,
        n_results=min(top_k, count),
        include=["documents", "metadatas", "distances"],
    )

    retrieved: list[dict[str, Any]] = []
    if results and results["documents"]:
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            retrieved.append({
                "text": doc,
                "source": meta.get("source", "unknown"),
                "section": meta.get("section", "unknown"),
                "relevance_score": round(1.0 - dist, 4),
            })
    return retrieved


def retrieve_rag_context(
    aggregated_data: dict[str, Any],
    top_k: int = 3,
) -> dict[str, Any]:
    """
    Extract key info from aggregated data, query ChromaDB,
    return structured RAG context with a formatted string.
    """
    query = extract_key_information(aggregated_data)
    results = query_knowledge_base(query, top_k)

    context_parts: list[str] = []
    for i, r in enumerate(results, 1):
        context_parts.append(
            f"[Industry Guideline {i}] (Source: {r['source']} — {r['section']}, "
            f"relevance: {r['relevance_score']:.2f})\n{r['text']}"
        )

    return {
        "query": query,
        "retrieved_texts": results,
        "context_string": "\n\n".join(context_parts),
    }


# ─── 3. Prompt Integration ──────────────────────────────────────────────────

def build_rag_prompt_block(rag_context: dict[str, Any]) -> str:
    """
    Build a formatted prompt block from the RAG context, ready to be
    inserted into the LLM user prompt alongside the four data sections.
    """
    context_string = rag_context.get("context_string", "")
    if not context_string:
        return ""

    return (
        "## Industry Guidelines & Reference Standards (Retrieved from Knowledge Base)\n"
        "The following industry standards and guidelines were automatically retrieved "
        "based on relevance to the farm data. Use these as authoritative reference "
        "when making assessments, risk evaluations, and recommendations.\n\n"
        f"{context_string}\n\n"
        "Apply the thresholds, scoring models, and risk indicators from these guidelines "
        "when evaluating the farm data. Cite specific thresholds when flagging risks "
        "or making recommendations."
    )


def build_full_rag_prompt(
    aggregated_data: dict[str, Any],
    top_k: int = 3,
) -> dict[str, Any]:
    """
    Complete RAG pipeline: extract key info → query ChromaDB → assemble prompt block.

    This is the main entry point called by the /rag_query FastAPI endpoint.
    """
    rag_context = retrieve_rag_context(aggregated_data, top_k)
    prompt_block = build_rag_prompt_block(rag_context)

    return {
        "query": rag_context["query"],
        "retrieved_count": len(rag_context["retrieved_texts"]),
        "retrieved_texts": rag_context["retrieved_texts"],
        "prompt_block": prompt_block,
    }


# ─── CLI ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="BioFin RAG Pipeline")
    parser.add_argument("--ingest", action="store_true", help="Ingest knowledge base")
    parser.add_argument("--query", type=str, help="Query the knowledge base")
    parser.add_argument("--rebuild", action="store_true", help="Force rebuild")
    args = parser.parse_args()

    if args.ingest or args.rebuild:
        result = ingest_knowledge_base(force_rebuild=args.rebuild)
        print(result)
    elif args.query:
        results = query_knowledge_base(args.query)
        for r in results:
            print(f"\n[{r['source']}/{r['section']}] (score: {r['relevance_score']:.3f})")
            print(r["text"][:200] + "...")
    else:
        result = ingest_knowledge_base()
        print(result)
