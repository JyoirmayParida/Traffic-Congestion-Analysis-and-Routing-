"""
graph.py — NetworkX DiGraph construction and ML weight injection.

INV-1: W(u,v) = base_time_sec(u,v) + predicted_delay(v)
        Delay is at the DESTINATION junction v, never the source u.
INV-2: Routing objective is minimum travel time, never distance.
"""

from __future__ import annotations

import logging
from typing import Any

import networkx as nx

logger = logging.getLogger("graph")


def build_graph(junctions: list[dict[str, Any]]) -> nx.DiGraph:
    """
    Construct a directed road graph from junction data.

    Parameters
    ----------
    junctions : list of dicts with keys:
        junction_id (str), lat (float), lng (float), city (str),
        edges (list of dicts with 'to', 'base_time_sec', 'distance_m')

    Returns
    -------
    nx.DiGraph with node attrs {lat, lng, city} and edge attrs
    {base_time_sec, distance_m, weight} where initial weight == base_time_sec.
    """
    G = nx.DiGraph()

    for junc in junctions:
        jid = junc["junction_id"]
        G.add_node(
            jid,
            lat=float(junc.get("lat", 0.0)),
            lng=float(junc.get("lng", 0.0)),
            city=junc.get("city", ""),
            name=junc.get("name", jid),
            tier=junc.get("tier", "tier1"),
        )

        for edge in junc.get("edges", []):
            to_id = edge["to"]
            base_time = float(edge.get("base_time_sec", 60.0))
            distance_m = float(edge.get("distance_m", 0.0))

            G.add_edge(
                jid,
                to_id,
                base_time_sec=base_time,
                distance_m=distance_m,
                weight=base_time,  # initial weight — overwritten by inject_ml_weights
            )

    logger.info(
        f"Graph built: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges."
    )
    return G


def inject_ml_weights(
    graph: nx.DiGraph,
    delays: dict[str, float],
) -> nx.DiGraph:
    """
    Update edge weights using ML-predicted delays.

    INV-1 enforcement:
        W(u, v) = base_time_sec(u, v) + delays.get(v, 0)
        The delay is always at the DESTINATION v.
        We deliberately do NOT use delays.get(u).

    Parameters
    ----------
    graph  : the DiGraph returned by build_graph()
    delays : junction_id → predicted_delay_sec mapping

    Returns
    -------
    The same graph instance with updated 'weight' attributes.
    """
    for u, v, data in graph.edges(data=True):
        base = data.get("base_time_sec", 60.0)
        delay_at_dest = delays.get(v, 0.0)  # INV-1: delay at DESTINATION v
        graph[u][v]["weight"] = base + delay_at_dest

    injected = sum(1 for v in graph.nodes() if v in delays)
    logger.info(
        f"ML weights injected: {injected}/{graph.number_of_nodes()} junctions "
        f"had delay predictions."
    )
    return graph


def compute_total_distance(graph: nx.DiGraph, path: list[str]) -> float:
    """
    Informational only — sum of distance_m along a path.
    This is NEVER used as a routing objective (INV-2).
    """
    total = 0.0
    for i in range(len(path) - 1):
        u, v = path[i], path[i + 1]
        if graph.has_edge(u, v):
            total += graph[u][v].get("distance_m", 0.0)
    return total
