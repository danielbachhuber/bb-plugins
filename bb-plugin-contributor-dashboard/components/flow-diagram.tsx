// The overview: issues and pull requests drawn through the delivery model's
// six stages. A box is a stage's queue now; a line is what moved in the
// period, thicker for more. The amber dashed lines are the paths a straight
// line would hide: steps skipped and work sent back.
import type { FlowCounts, StageKey, StageSummary } from "@/dashboard/contract";

import { days } from "./stage-flow";

// Colours are written out rather than set as Tailwind classes: bb's stylesheet
// is prebuilt, so an arbitrary colour class a plugin invents has no rule.
const BLUE = "#2a78d6";
const GREEN = "#1baf7a";
const SLATE = "#7c8794";
const AMBER = "#d9820a";
const PURPLE = "#9b6cbf";
const INK = "currentColor";
const CARD = "var(--color-card, transparent)";

/** The model's six stages, at the x each column starts on a 960-wide drawing. */
const COLUMNS = [
  { name: "Identify", x: 0 },
  { name: "Define", x: 170 },
  { name: "Execute", x: 260 },
  { name: "Verify", x: 540 },
  { name: "Release", x: 780 },
  { name: "Learn", x: 890 },
];

const HEIGHT = 360;
const BOX = 58;

function StepBox({
  x,
  y,
  w,
  stage,
  onOpen,
}: {
  x: number;
  y: number;
  w: number;
  stage: StageSummary | undefined;
  onOpen: (key: StageKey) => void;
}) {
  if (stage === undefined) return null;
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${stage.label}: ${stage.waiting} waiting, half within ${days(stage.median)}`}
      onClick={() => onOpen(stage.key)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onOpen(stage.key);
      }}
      className="cursor-pointer [&:hover>rect]:stroke-[#2a78d6]"
    >
      <rect x={x} y={y} width={w} height={BOX} rx={7} fill={CARD} stroke={INK} strokeOpacity={0.2} />
      <text x={x + 9} y={y + 16} fontSize={11.5} fontWeight={600} fill={INK}>
        {stage.label}
      </text>
      <text x={x + 9} y={y + 34} fontSize={11} fill={INK}>
        <tspan fontWeight={700} fontSize={14}>
          {stage.waiting}
        </tspan>
        <tspan fillOpacity={0.6}> waiting</tspan>
      </text>
      <text x={x + 9} y={y + 50} fontSize={10.5} fill={INK} fillOpacity={0.6}>
        {stage.left === 0 ? (
          "none left this period"
        ) : (
          <>
            half in{" "}
            <tspan fill={BLUE} fillOpacity={1}>
              {days(stage.median)}
            </tspan>
          </>
        )}
      </text>
    </g>
  );
}

function EndBox({ x, y, label, count, tone }: { x: number; y: number; label: string; count: number; tone: string }) {
  return (
    <g>
      <rect x={x} y={y} width={88} height={BOX} rx={7} fill={tone} fillOpacity={0.1} stroke={tone} strokeOpacity={0.5} />
      <text x={x + 9} y={y + 24} fontSize={15} fontWeight={700} fill={INK}>
        {count}
      </text>
      <text x={x + 9} y={y + 42} fontSize={10.5} fill={INK} fillOpacity={0.7}>
        {label}
      </text>
    </g>
  );
}

function Edge({
  d,
  count,
  scale,
  tone = SLATE,
  dashed = false,
  label,
  lx,
  ly,
  anchor = "middle",
}: {
  d: string;
  count: number;
  /** The count drawn at the widest line. */
  scale: number;
  tone?: string;
  dashed?: boolean;
  label?: string;
  lx?: number;
  ly?: number;
  anchor?: "start" | "middle" | "end";
}) {
  // A path nothing took is left out rather than drawn as a hairline.
  if (count === 0) return null;
  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={tone}
        strokeOpacity={dashed ? 0.85 : 0.45}
        strokeWidth={Math.max(1.5, (count / Math.max(1, scale)) * 16)}
        strokeDasharray={dashed ? "5 4" : undefined}
        strokeLinecap="round"
      />
      {label === undefined ? null : (
        <text x={lx} y={ly} fontSize={10.5} textAnchor={anchor} fill={dashed ? tone : INK} fillOpacity={dashed ? 1 : 0.75}>
          {label}
        </text>
      )}
    </g>
  );
}

export function FlowDiagram({
  flow,
  stages,
  periodLabel,
  onOpenStage,
}: {
  flow: FlowCounts;
  stages: readonly StageSummary[];
  /** How long the period is, such as "six weeks". */
  periodLabel: string;
  onOpenStage: (stage: StageKey) => void;
}) {
  const stage = (key: StageKey) => stages.find((candidate) => candidate.key === key);
  const { issues, pullRequests: prs } = flow;
  // One scale for both rows, so a line's width compares across them.
  const scale = Math.max(issues.opened, prs.opened);
  const issuesClosed = issues.closedAssigned + issues.closedPlanned + issues.closedUntriaged;

  return (
    <section className="mt-5" aria-labelledby="overview">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="overview" className="text-lg font-semibold">
          Overview
        </h2>
        <span className="text-xs text-muted-foreground">
          Boxes are what is waiting now; lines are what was opened in the last {periodLabel} and where it went,
          thicker for more.
        </span>
      </div>

      <svg
        viewBox={`0 0 960 ${HEIGHT}`}
        className="mt-3 block w-full text-foreground"
        role="group"
        aria-label="Issues and pull requests through the delivery stages"
      >
        {COLUMNS.map((column, index) => (
          <g key={column.name}>
            {index === 0 ? null : (
              <line x1={column.x} x2={column.x} y1={4} y2={HEIGHT} stroke={INK} strokeOpacity={0.08} />
            )}
            <text x={column.x + 6} y={14} fontSize={10} fontWeight={600} letterSpacing={0.6} fill={INK} fillOpacity={0.55}>
              {column.name.toUpperCase()}
            </text>
          </g>
        ))}

        <text x={6} y={42} fontSize={11} fontWeight={600} fill={INK} fillOpacity={0.8}>
          Issues · {issues.opened} opened
        </text>
        <text x={6} y={212} fontSize={11} fontWeight={600} fill={INK} fillOpacity={0.8}>
          Pull requests · {prs.opened} opened
        </text>

        {/* Issues: Triage in Identify, Assign ownership in Execute. */}
        <Edge d="M 6 84 L 18 84" count={issues.opened} scale={scale} />
        <StepBox x={18} y={55} w={120} stage={stage("triage")} onOpen={onOpenStage} />
        <Edge d="M 138 84 L 300 84" count={issues.planned} scale={scale} tone={BLUE} label={`${issues.planned} into a plan`} lx={219} ly={76} />
        <StepBox x={300} y={55} w={132} stage={stage("ownership")} onOpen={onOpenStage} />
        <Edge
          d="M 110 113 C 110 150, 330 150, 340 113"
          count={issues.assignedWithoutPlan}
          scale={scale}
          tone={AMBER}
          dashed
          label={`${issues.assignedWithoutPlan} assigned without a plan`}
          lx={225}
          ly={156}
        />
        <Edge
          d="M 432 84 L 800 84"
          count={issues.closedAssigned}
          scale={scale}
          tone={GREEN}
          label={`${issues.closedAssigned} closed after someone took them`}
          lx={616}
          ly={76}
        />
        <EndBox x={800} y={55} label="issues closed" count={issuesClosed} tone={GREEN} />
        <Edge
          d="M 40 113 L 40 140"
          count={issues.closedUntriaged}
          scale={scale}
          label={`${issues.closedUntriaged} closed untriaged`}
          lx={34}
          ly={152}
          anchor="start"
        />
        {issues.closedPlanned === 0 ? null : (
          <text x={440} y={128} fontSize={10.5} fill={INK} fillOpacity={0.6}>
            {issues.closedPlanned} closed with nobody assigned
          </text>
        )}

        {/* The mirror does not store which pull request is for which issue. */}
        <path d="M 400 113 L 400 225" fill="none" stroke={SLATE} strokeOpacity={0.6} strokeWidth={1.5} strokeDasharray="3 4" />
        <text x={392} y={182} fontSize={10.5} textAnchor="end" fill={INK} fillOpacity={0.6}>
          which pull request is for
        </text>
        <text x={392} y={195} fontSize={10.5} textAnchor="end" fill={INK} fillOpacity={0.6}>
          which issue is not tracked
        </text>

        {/* Pull requests: Prepare in Execute, Code review and Merge decision in Verify. */}
        <Edge
          d="M 6 254 L 300 254"
          count={prs.opened}
          scale={scale}
          tone={BLUE}
          label={`${prs.drafted} spent time as drafts`}
          lx={150}
          ly={243}
        />
        <StepBox x={300} y={225} w={132} stage={stage("prepare")} onOpen={onOpenStage} />
        <Edge d="M 432 254 L 560 254" count={prs.asked} scale={scale} tone={BLUE} label={`${prs.asked} reviewer asked`} lx={496} ly={243} />
        {prs.reviewedUnasked === 0 ? null : (
          <text x={496} y={276} fontSize={10.5} textAnchor="middle" fill={INK} fillOpacity={0.6}>
            +{prs.reviewedUnasked} reviewed unasked
          </text>
        )}
        <StepBox x={560} y={225} w={100} stage={stage("review")} onOpen={onOpenStage} />
        <Edge d="M 660 254 L 676 254" count={prs.approved} scale={scale} tone={BLUE} />
        <text x={668} y={218} fontSize={10.5} textAnchor="middle" fill={INK} fillOpacity={0.75}>
          {prs.approved} approved
        </text>
        <StepBox x={676} y={225} w={104} stage={stage("decision")} onOpen={onOpenStage} />
        <Edge d="M 780 254 L 800 254" count={prs.merged - prs.mergedUnreviewed} scale={scale} tone={PURPLE} />
        <EndBox x={800} y={225} label="merged" count={prs.merged} tone={PURPLE} />

        <Edge
          d="M 440 225 C 520 178, 760 178, 844 225"
          count={prs.mergedUnreviewed}
          scale={scale}
          tone={AMBER}
          dashed
          label={`${prs.mergedUnreviewed} merged with no review`}
          lx={640}
          ly={180}
        />
        <Edge
          d="M 610 283 C 610 330, 370 330, 366 283"
          count={prs.changesRequested}
          scale={scale}
          tone={AMBER}
          dashed
          label={`${prs.changesRequested} sent back with changes requested`}
          lx={488}
          ly={340}
        />
        <Edge
          d="M 728 283 L 728 320 L 800 320"
          count={prs.closed}
          scale={scale}
          label={`${prs.closed} closed unmerged`}
          lx={806}
          ly={324}
          anchor="start"
        />

        <text x={176} y={350} fontSize={10} fill={INK} fillOpacity={0.45}>
          Shaping is not in GitHub
        </text>
        <text x={896} y={82} fontSize={10} fill={INK} fillOpacity={0.45}>
          Not in
        </text>
        <text x={896} y={95} fontSize={10} fill={INK} fillOpacity={0.45}>
          GitHub
        </text>
      </svg>
    </section>
  );
}
