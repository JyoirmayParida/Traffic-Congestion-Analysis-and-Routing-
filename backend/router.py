"""
router.py — Dijkstra-based optimal and alternative route finder.

INV-2: Objective is MINIMUM TRAVEL TIME — always use weight='weight',
       never raw distance or hop count.
"""

from __future__ import annotations

import logging

import networkx as nx
from fastapi import HTTPException

logger = logging.getLogger("router")


def find_optimal_route(
    graph: nx.DiGraph,
    source_id: str,
    dest_id: str,
) -> dict:
    """
    Find the minimum travel-time path from source_id to dest_id.

    Uses Dijkstra with weight='weight' (INV-2).
    Raises HTTP 404 if no path exists.

    Returns
    -------
    dict with keys:
        path          : list[str]  — ordered junction IDs
        total_time_sec: float      — sum of edge weights along path
    """
    if source_id not in graph:
        raise HTTPException(
            status_code=404,
            detail=f"Source junction '{source_id}' not found in the graph.",
        )
    if dest_id not in graph:
        raise HTTPException(
            status_code=404,
            detail=f"Destination junction '{dest_id}' not found in the graph.",
        )

    try:
        path: list[str] = nx.dijkstra_path(
            graph, source=source_id, target=dest_id, weight="weight"
        )
        total_time_sec: float = nx.dijkstra_path_length(
            graph, source=source_id, target=dest_id, weight="weight"
        )
    except nx.NetworkXNoPath:
        raise HTTPException(
            status_code=404,
            detail=f"No path found between '{source_id}' and '{dest_id}'.",
        )
    except nx.NodeNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    logger.info(
        f"Optimal route: {source_id} → {dest_id} | "
        f"{len(path)} junctions | {total_time_sec:.1f}s"
    )
    return {"path": path, "total_time_sec": total_time_sec}


def find_alternative_routes(
    graph: nx.DiGraph,
    source_id: str,
    dest_id: str,
    k: int,
    optimal_time: float,
) -> list[dict]:
    """
    Generate up to k alternative routes that are within 130% of optimal_time.
    Paths identical to the optimal path are excluded.

    Uses nx.shortest_simple_paths (Yen's k-shortest paths algorithm) with
    weight='weight' to rank by minimum travel time (INV-2).

    Parameters
    ----------
    k            : maximum number of alternatives to return
    optimal_time : reference travel time from find_optimal_route

    Returns
    -------
    list of dicts, each with:
        path          : list[str]
        total_time_sec: float
        pct_slower    : float  — percentage above optimal (e.g. 12.4 means 12.4% slower)
    """
    MAX_THRESHOLD = optimal_time * 1.30
    candidates: list[dict] = []

    try:
        path_gen = nx.shortest_simple_paths(
            graph, source=source_id, target=dest_id, weight="weight"
        )
        # We skip candidate 0 (it is the optimal path) and evaluate up to k+2 more
        checked = 0
        for candidate_path in path_gen:
            if checked > k + 20:
                # Safety valve — avoid enumerating too many simple paths on large graphs
                break
            checked += 1

            # Compute travel time for candidate
            total_time = 0.0
            for i in range(len(candidate_path) - 1):
                u, v = candidate_path[i], candidate_path[i + 1]
                if graph.has_edge(u, v):
                    total_time += graph[u][v].get("weight", 0.0)

            # Skip if identical to optimal (first path from shortest_simple_paths)
            if abs(total_time - optimal_time) < 1e-6 and len(candidates) == 0:
                # This IS the optimal path — skip
                continue

            if total_time > MAX_THRESHOLD:
                # Paths are returned in ascending cost order; no need to continue
                break

            pct_slower = ((total_time - optimal_time) / optimal_time) * 100.0 if optimal_time > 0 else 0.0
            candidates.append(
                {
                    "path": candidate_path,
                    "total_time_sec": round(total_time, 3),
                    "pct_slower": round(pct_slower, 2),
                }
            )

            if len(candidates) >= k:
                break

    except (nx.NetworkXNoPath, nx.NodeNotFound):
        logger.info("No alternative paths found (graph too sparse or disconnected).")

    logger.info(
        f"Alternative routes: {len(candidates)} found for "
        f"{source_id} → {dest_id} (k={k}, threshold={MAX_THRESHOLD:.1f}s)"
    )
    return candidates
