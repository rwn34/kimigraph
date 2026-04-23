/**
 * Graph query interface for KimiGraph.
 */

import {
  Node,
  Edge,
  Subgraph,
  TraversalOptions,
} from '../types';
import { QueryBuilder } from '../db/queries';

export class GraphTraverser {
  private queries: QueryBuilder;

  constructor(queries: QueryBuilder) {
    this.queries = queries;
  }

  /**
   * Get the call graph for a function (callers + callees).
   */
  getCallGraph(nodeId: string, depth = 2): Subgraph {
    const nodes = new Map<string, Node>();
    const edges: Edge[] = [];

    const root = this.queries.getNode(nodeId);
    if (!root) return { nodes: [], edges: [], entryPoints: [] };
    nodes.set(nodeId, root);

    // Outgoing (callees)
    this.bfs(nodeId, 'outbound', ['calls'], depth, nodes, edges);
    // Incoming (callers)
    this.bfs(nodeId, 'inbound', ['calls'], depth, nodes, edges);

    return {
      nodes: [...nodes.values()],
      edges,
      entryPoints: [nodeId],
    };
  }

  /**
   * Get impact radius: all nodes affected by changing this node.
   */
  getImpactRadius(nodeId: string, depth = 3): Subgraph {
    const nodes = new Map<string, Node>();
    const edges: Edge[] = [];

    const root = this.queries.getNode(nodeId);
    if (!root) return { nodes: [], edges: [], entryPoints: [] };
    nodes.set(nodeId, root);

    this.bfs(nodeId, 'inbound', ['calls', 'imports', 'extends', 'ffi'], depth, nodes, edges);

    return {
      nodes: [...nodes.values()],
      edges,
      entryPoints: [nodeId],
    };
  }

  /**
   * Find shortest path between two nodes.
   */
  findPath(fromId: string, toId: string): Subgraph {
    const pathNodes = this.queries.findPath(fromId, toId);
    if (pathNodes.length === 0) return { nodes: [], edges: [], entryPoints: [] };

    const ids = pathNodes.map((n) => n.id);
    const edges = this.queries.getEdgesForNodes(ids);

    return {
      nodes: pathNodes,
      edges,
      entryPoints: [fromId],
    };
  }

  /**
   * Get type hierarchy.
   */
  getTypeHierarchy(nodeId: string): Subgraph {
    const nodes = this.queries.getTypeHierarchy(nodeId, 'both');
    const ids = nodes.map((n) => n.id);
    const edges = this.queries.getEdgesForNodes([nodeId, ...ids]);

    return {
      nodes,
      edges,
      entryPoints: [nodeId],
    };
  }

  /**
   * Generic BFS traversal.
   */
  traverseBFS(startId: string, options: TraversalOptions = {}): Subgraph {
    const {
      maxDepth = 2,
      maxNodes = 50,
      edgeKinds,
      direction = 'both',
    } = options;

    const nodes = new Map<string, Node>();
    const edges: Edge[] = [];

    const root = this.queries.getNode(startId);
    if (!root) return { nodes: [], edges: [], entryPoints: [] };
    nodes.set(startId, root);

    this.bfs(startId, direction, edgeKinds, maxDepth, nodes, edges, maxNodes);

    return {
      nodes: [...nodes.values()],
      edges,
      entryPoints: [startId],
    };
  }

  private bfs(
    startId: string,
    direction: 'outbound' | 'inbound' | 'both',
    edgeKinds: string[] | undefined,
    maxDepth: number,
    nodes: Map<string, Node>,
    edges: Edge[],
    maxNodes?: number
  ): void {
    const visited = new Set<string>([startId]);
    let frontier = [startId];

    for (let d = 0; d < maxDepth; d++) {
      if (frontier.length === 0) break;
      const nextFrontier: string[] = [];

      for (const current of frontier) {
        const allEdges: Edge[] = [];
        if (direction === 'outbound' || direction === 'both') {
          allEdges.push(...this.queries.getOutgoingEdges(current));
        }
        if (direction === 'inbound' || direction === 'both') {
          allEdges.push(...this.queries.getIncomingEdges(current));
        }

        for (const edge of allEdges) {
          if (edgeKinds && !edgeKinds.includes(edge.kind)) continue;

          const neighborId = edge.source === current ? edge.target : edge.source;
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            const neighbor = this.queries.getNode(neighborId);
            if (neighbor) {
              nodes.set(neighborId, neighbor);
              edges.push(edge);
              nextFrontier.push(neighborId);

              if (maxNodes && nodes.size >= maxNodes) return;
            }
          }
        }
      }

      frontier = nextFrontier;
    }
  }
}
