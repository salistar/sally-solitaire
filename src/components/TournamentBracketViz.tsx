/**
 * @file TournamentBracketViz.tsx
 * @description SVG-overlay bracket visualizer. Renders columns of bracket
 * nodes (matches) and draws connection lines between a node and its
 * downstream slot using react-native-svg.
 *
 * Layout strategy:
 *   - Each round is a fixed-width column ; nodes are vertically spaced so
 *     children align with the midpoint between their two feeders.
 *   - Connection lines are simple stepped polylines from each node's right
 *     edge to its successor's left edge.
 *
 * Limitations:
 *   - Supports single-elim and double-elim. Round-robin uses a flat list
 *     elsewhere (no bracket tree).
 *   - For double-elim, we draw WB column-set and LB column-set separately
 *     (no cross-bracket connectors — that would clutter the screen).
 */
import React from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import type { TournamentBracketNode } from '../../shared/api';

interface NodeWithCoord extends TournamentBracketNode {
  /** Pixel x of the node's top-left within the SVG canvas. */
  x: number;
  /** Pixel y of the node's top-left within the SVG canvas. */
  y: number;
}

const NODE_W = 150;
const NODE_H = 64;
const ROUND_GAP = 36;  // horizontal gap between columns
const NODE_V_PAD = 16;

interface Props {
  bracket: TournamentBracketNode[];
  /** Match-tap callback (router.push internally). */
  onTapMatch: (matchCode: string) => void;
  /** Subset of bracketTypes to render. Useful for double-elim to draw WB and
   *  LB on separate scroll passes. Defaults to all types in the bracket. */
  filter?: (n: TournamentBracketNode) => boolean;
  /** Optional section title above the columns. */
  title?: string;
  palette: { text: string; textSecondary: string; card: string; border: string };
}

export default function TournamentBracketViz({
  bracket, onTapMatch, filter, title, palette,
}: Props) {
  const nodes = filter ? bracket.filter(filter) : bracket;
  if (nodes.length === 0) return null;

  // Group by round; within each round sort by position
  const byRound = new Map<number, TournamentBracketNode[]>();
  for (const n of nodes) {
    if (!byRound.has(n.round)) byRound.set(n.round, []);
    byRound.get(n.round)!.push(n);
  }
  const roundKeys = Array.from(byRound.keys()).sort((a, b) => a - b);
  for (const k of roundKeys) byRound.get(k)!.sort((a, b) => a.position - b.position);

  // Compute (x,y) for every node. y spacing doubles each round so children
  // align with the midpoint of their two feeders.
  const r0Count = byRound.get(roundKeys[0])?.length ?? 1;
  const baseStride = NODE_H + NODE_V_PAD;
  const totalHeight = r0Count * baseStride + NODE_V_PAD;
  const positioned: NodeWithCoord[] = [];
  roundKeys.forEach((round, colIdx) => {
    const list = byRound.get(round)!;
    const cnt = list.length;
    // Spacing in this round: each node spans `r0Count / cnt` of the base height
    const stride = totalHeight / cnt;
    list.forEach((n, posIdx) => {
      positioned.push({
        ...n,
        x: colIdx * (NODE_W + ROUND_GAP),
        y: posIdx * stride + (stride - NODE_H) / 2,
      });
    });
  });

  // Compute connection lines. A round-(r) node at position p connects to a
  // round-(r+1) node at position floor(p/2). Match the node center heights.
  type Conn = { x1: number; y1: number; x2: number; y2: number };
  const connections: Conn[] = [];
  for (let i = 0; i < roundKeys.length - 1; i++) {
    const r = roundKeys[i];
    const rNext = roundKeys[i + 1];
    const cur = positioned.filter((n) => n.round === r);
    const nxt = positioned.filter((n) => n.round === rNext);
    cur.forEach((src) => {
      const tgt = nxt.find((n) => n.position === Math.floor(src.position / 2));
      if (!tgt) return;
      connections.push({
        x1: src.x + NODE_W,
        y1: src.y + NODE_H / 2,
        x2: tgt.x,
        y2: tgt.y + NODE_H / 2,
      });
    });
  }

  const svgWidth = roundKeys.length * (NODE_W + ROUND_GAP);

  return (
    <View style={{ marginVertical: 8 }}>
      {title && (
        <Text style={[styles.title, { color: '#FCD34D' }]}>{title}</Text>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ width: svgWidth, height: totalHeight, position: 'relative' }}>
          {/* SVG underlay : connection lines + step path */}
          <Svg width={svgWidth} height={totalHeight} style={StyleSheet.absoluteFill}>
            {connections.map((c, i) => {
              const midX = (c.x1 + c.x2) / 2;
              // Stepped path: src → midX-step → midX-step (vertical) → tgt
              return (
                <React.Fragment key={i}>
                  <Line x1={c.x1} y1={c.y1} x2={midX} y2={c.y1} stroke="rgba(167,139,250,0.5)" strokeWidth={1.5} />
                  <Line x1={midX} y1={c.y1} x2={midX} y2={c.y2} stroke="rgba(167,139,250,0.5)" strokeWidth={1.5} />
                  <Line x1={midX} y1={c.y2} x2={c.x2} y2={c.y2} stroke="rgba(167,139,250,0.5)" strokeWidth={1.5} />
                </React.Fragment>
              );
            })}
          </Svg>
          {/* Node overlay */}
          {positioned.map((n) => {
            const isPlayable = n.matchCode && !n.winnerUserId;
            return (
              <TouchableOpacity
                key={`${n.bracketType ?? 'w'}-${n.round}-${n.position}`}
                onPress={() => n.matchCode && isPlayable && onTapMatch(n.matchCode)}
                disabled={!isPlayable}
                activeOpacity={isPlayable ? 0.85 : 1}
                style={[styles.node, {
                  left: n.x, top: n.y, width: NODE_W, height: NODE_H,
                  backgroundColor: palette.card,
                  borderColor: isPlayable ? '#0EA5E9' : palette.border,
                }]}
              >
                <BracketSlot
                  name={n.p1DisplayName}
                  isWinner={n.winnerUserId === n.p1UserId}
                  palette={palette}
                />
                <View style={[styles.sep, { backgroundColor: palette.border }]} />
                <BracketSlot
                  name={n.p2DisplayName}
                  isWinner={n.winnerUserId === n.p2UserId}
                  palette={palette}
                />
                {isPlayable && <Text style={styles.live}>● LIVE</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function BracketSlot({ name, isWinner, palette }: {
  name: string | null; isWinner: boolean; palette: any;
}) {
  return (
    <Text
      style={[
        styles.slot,
        {
          color: name ? (isWinner ? '#10B981' : palette.text) : palette.textSecondary,
          fontFamily: isWinner ? 'Inter-Black' : 'Inter-Regular',
        },
      ]}
      numberOfLines={1}
    >
      {isWinner ? '✓ ' : ''}{name ?? '— (en attente)'}
    </Text>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 10, fontFamily: 'Inter-Black', letterSpacing: 1.5, marginBottom: 4 },
  node: {
    position: 'absolute',
    borderWidth: 1, borderRadius: 8, padding: 6,
    justifyContent: 'center',
  },
  slot: { fontSize: 11 },
  sep: { height: 1, marginVertical: 3 },
  live: {
    position: 'absolute', bottom: 2, right: 6,
    color: '#0EA5E9', fontSize: 8, fontFamily: 'Inter-Black', letterSpacing: 0.5,
  },
});
