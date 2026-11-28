import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { LogEvent } from '../types.js';

interface Props {
  events: LogEvent[];
  isStreaming: boolean;
  onClear: () => void;
}

/* SVG icon for the empty state */
function IconSignal(): ReactNode {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 4v16" />
    </svg>
  );
}

type FeedFilter = 'all' | 'record' | 'find' | 'verify' | 'quarantine';

function matchesFilter(e: LogEvent, filter: FeedFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'record':
      return Boolean(e.event?.includes('record'));
    case 'find':
      return Boolean(e.event?.includes('find'));
    case 'verify':
      return Boolean(e.event?.includes('verify'));
    case 'quarantine':
      return Boolean(e.quarantined || e.status?.includes('quarantine'));
    default:
      return true;
  }
}

const FILTERS: { id: FeedFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'record', label: 'Record Failure' },
  { id: 'find', label: 'Find Fix' },
  { id: 'verify', label: 'Verify Fix' },
  { id: 'quarantine', label: 'Quarantine Alerts' },
];

export function LiveFeedScreen({ events, isStreaming, onClear }: Props): ReactNode {
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const feedRef = useRef<HTMLDivElement | null>(null);

  const filteredEvents = events.filter((e) => matchesFilter(e, filter));
  const countFor = (f: FeedFilter): number => events.filter((e) => matchesFilter(e, f)).length;

  /*
   * estimateSize should be large enough to avoid overlap.
   * measureElement corrects the real height dynamically.
   */
  const virtualizer = useVirtualizer({
    count: filteredEvents.length,
    getScrollElement: () => feedRef.current,
    estimateSize: () => 62,
    overscan: 8,
  });

  useEffect(() => {
    if (autoScroll && feedRef.current) {
      const last = filteredEvents.length - 1;
      if (last >= 0) {
        virtualizer.scrollToIndex(last, { behavior: 'smooth' });
      }
    }
  }, [autoScroll, filteredEvents.length, virtualizer]);

  const getToolCallTheme = (evt: LogEvent) => {
    if (evt.quarantined || evt.status?.includes('quarantine')) {
      return {
        typeClass: 'quarantine',
        badge: <span className="badge rose">QUARANTINE_ALERT</span>,
      };
    }
    const eventName = evt.event?.toLowerCase() || '';
    if (eventName.includes('record')) {
      return {
        typeClass: 'record',
        badge: <span className="badge emerald">RECORD_FAILURE</span>,
      };
    }
    if (eventName.includes('find')) {
      return {
        typeClass: 'find',
        badge: <span className="badge gray">FIND_FIX</span>,
      };
    }
    if (eventName.includes('verify')) {
      return {
        typeClass: 'verify',
        badge: <span className="badge gray">VERIFY_FIX</span>,
      };
    }
    return {
      typeClass: '',
      badge: <span className="badge gray">{evt.event?.toUpperCase() || 'INFO'}</span>,
    };
  };

  const hasEvents = events.length > 0;

  return (
    <div>
      <div className="screen-header">
        <div className="screen-title-row">
          <div>
            <h1 className="screen-title">Live Activity Feed</h1>
            <p className="screen-subtitle">
              Real-time SSE event stream — MCP tool calls, fingerprinting, and retrieval decisions.
            </p>
          </div>

          <div className="feed-header-controls">
            <div className="status-badge">
              <span
                className="pulse-dot"
                style={{
                  background: isStreaming ? 'var(--status-success)' : 'var(--status-danger)',
                }}
              />
              <span>{isStreaming ? 'Streaming' : 'Disconnected'}</span>
            </div>

            <button
              className={`btn btn-outline ${autoScroll ? 'active' : ''}`}
              onClick={() => setAutoScroll(!autoScroll)}
              aria-label="Toggle auto-scrolling"
              aria-pressed={autoScroll}
            >
              {autoScroll ? 'Auto-scroll: ON' : 'Auto-scroll: PAUSED'}
            </button>

            <button
              className="btn btn-outline"
              onClick={onClear}
              disabled={!hasEvents}
              aria-label="Clear event stream"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      <div className="feed-filter-bar" role="group" aria-label="Filter events">
        {FILTERS.map((tab) => (
          <button
            key={tab.id}
            className={`nav-tab ${filter === tab.id ? 'active' : ''}`}
            onClick={() => setFilter(tab.id)}
            aria-pressed={filter === tab.id}
          >
            {tab.label}
            <span className="nav-badge gray">{countFor(tab.id)}</span>
          </button>
        ))}
      </div>

      <div className="panel feed-panel">
        {filteredEvents.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <IconSignal />
            </div>
            <h2 className="empty-state-title">
              {hasEvents ? 'No events match this filter' : 'Awaiting Live Telemetry'}
            </h2>
            <p className="empty-state-desc">
              {hasEvents ? (
                <>Choose another filter above to see the other {events.length} captured events.</>
              ) : (
                <>
                  Events stream in real time over SSE when an AI agent calls tools (
                  <code>record_failure</code>, <code>find_fix</code>, or <code>verify_fix</code>).
                </>
              )}
            </p>
          </div>
        ) : (
          <div ref={feedRef} className="feed-scroll">
            {/* Total scrollable height */}
            <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const evt = filteredEvents[virtualRow.index];
                const { typeClass, badge } = getToolCallTheme(evt);

                return (
                  <div
                    key={`${evt.time ?? ''}-${virtualRow.index}`}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                      // gap between cards; counted in measureElement height
                      paddingBottom: '8px',
                      paddingTop: virtualRow.index === 0 ? '8px' : 0,
                    }}
                  >
                    <div className={`feed-item ${typeClass}`}>
                      <div className="feed-item-head">
                        <div className="feed-item-title">
                          {badge}
                          <span>{evt.msg ?? evt.event}</span>
                        </div>

                        <span
                          className="mono"
                          style={{
                            fontSize: '0.72rem',
                            color: 'var(--text-muted)',
                            whiteSpace: 'nowrap',
                            paddingLeft: '0.75rem',
                            flexShrink: 0,
                          }}
                        >
                          {evt.time ? new Date(evt.time).toLocaleTimeString() : 'now'}
                        </span>
                      </div>

                      <div className="feed-item-meta">
                        {evt.command && (
                          <div>
                            <span className="k">cmd: </span>
                            <code style={{ color: 'var(--text-primary)' }}>
                              {String(evt.command)}
                            </code>
                          </div>
                        )}

                        {evt.fingerprint && (
                          <div>
                            <span className="k">fp: </span>
                            <span className="mono" style={{ color: 'var(--accent)' }}>
                              {String(evt.fingerprint).slice(0, 16)}&hellip;
                            </span>
                          </div>
                        )}

                        {evt.matchCount !== undefined && (
                          <div>
                            <span className="k">matches: </span>
                            <strong style={{ color: 'var(--status-success)' }}>
                              {evt.matchCount}
                            </strong>
                          </div>
                        )}

                        {evt.repo && (
                          <div>
                            <span className="k">repo: </span>
                            <span className="mono">{String(evt.repo)}</span>
                          </div>
                        )}

                        {evt.quarantined && (
                          <span className="badge rose" style={{ fontSize: '0.68rem' }}>
                            BLOCKED
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
