import { Badge, Box, Button, CloseButton, Code, Divider, Group, ScrollArea, Space, Text, TextInput, Title, Tooltip } from '@mantine/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { socketio } from '../../../js/utils';
import { TrafficEvent } from '../utils';
import { FaFilter } from 'react-icons/fa';
import { MdClearAll } from 'react-icons/md';

const MAX_DISPLAYED = 500;

function eventTypeBadge(event_type: TrafficEvent['event_type']) {
    switch (event_type) {
        case 'conn_open':  return <Badge size="xs" color="teal"  radius="sm" variant="filled">OPEN</Badge>;
        case 'conn_close': return <Badge size="xs" color="gray"  radius="sm" variant="filled">CLOSE</Badge>;
        case 'blocked':    return <Badge size="xs" color="red"   radius="sm" variant="filled">BLOCKED</Badge>;
        case 'mangled':    return <Badge size="xs" color="orange" radius="sm" variant="filled">MANGLED</Badge>;
        case 'exception':  return <Badge size="xs" color="yellow" radius="sm" variant="filled">EXCEPTION</Badge>;
        default:           return <Badge size="xs" color="gray"  radius="sm" variant="filled">{event_type}</Badge>;
    }
}

function formatTime(ts: number) {
    const d = new Date(ts);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${d.getMilliseconds().toString().padStart(3,'0')}`;
}

function connStr(ev: TrafficEvent) {
    if (!ev.src_ip) return '—';
    return `${ev.src_ip}:${ev.src_port} → ${ev.dst_ip}:${ev.dst_port}`;
}

function eventMatchesFilter(ev: TrafficEvent, filter: string): boolean {
    if (!filter) return true;
    const f = filter.toLowerCase();
    if (ev.src_ip?.toLowerCase().includes(f)) return true;
    if (ev.dst_ip?.toLowerCase().includes(f)) return true;
    if (ev.src_port?.toString().includes(f)) return true;
    if (ev.dst_port?.toString().includes(f)) return true;
    if (ev.filter_name?.toLowerCase().includes(f)) return true;
    if (ev.event_type.toLowerCase().includes(f)) return true;
    return false;
}

type TrafficEventWithId = TrafficEvent & { _id: number };

export default function TrafficView({ service_id }: { service_id: string }) {
    const [events, setEvents] = useState<TrafficEventWithId[]>([]);
    const [filter, setFilter] = useState('');
    const [paused, setPaused] = useState(false);
    const pausedRef = useRef(paused);
    pausedRef.current = paused;
    const viewport = useRef<HTMLDivElement>(null);
    const [autoScroll, setAutoScroll] = useState(true);
    const idCounter = useRef(0);

    const assignIds = (items: TrafficEvent[]): TrafficEventWithId[] =>
        items.map(ev => ({ ...ev, _id: idCounter.current++ }));

    useEffect(() => {
        socketio.emit('nfproxy-traffic-join', { service: service_id });

        // Receive buffered events on join
        socketio.on(`nfproxy-traffic-init-${service_id}`, (data: TrafficEvent[]) => {
            if (!pausedRef.current) {
                setEvents(prev => {
                    const combined = [...prev, ...assignIds(data)];
                    return combined.slice(-MAX_DISPLAYED);
                });
            }
        });

        // Receive live events
        socketio.on(`nfproxy-traffic-${service_id}`, (ev: TrafficEvent) => {
            if (!pausedRef.current) {
                setEvents(prev => {
                    const next = [...prev, ...assignIds([ev])];
                    return next.slice(-MAX_DISPLAYED);
                });
            }
        });

        return () => {
            socketio.emit('nfproxy-traffic-leave', { service: service_id });
            socketio.off(`nfproxy-traffic-init-${service_id}`);
            socketio.off(`nfproxy-traffic-${service_id}`);
        };
    }, [service_id]);

    // Auto-scroll to bottom when new events arrive
    useEffect(() => {
        if (autoScroll && viewport.current) {
            viewport.current.scrollTo({ top: viewport.current.scrollHeight, behavior: 'smooth' });
        }
    }, [events, autoScroll]);

    const filtered = useMemo(
        () => filter ? events.filter(ev => eventMatchesFilter(ev, filter)) : events,
        [events, filter]
    );

    return (
        <Box>
            <Group justify="space-between" mb="xs">
                <Group gap="xs">
                    <FaFilter size={14} />
                    <TextInput
                        size="xs"
                        placeholder="Filter by IP, port, filter name, type…"
                        value={filter}
                        onChange={e => setFilter(e.currentTarget.value)}
                        rightSection={filter ? <CloseButton size="xs" onClick={() => setFilter('')} /> : null}
                        style={{ width: 280 }}
                    />
                </Group>
                <Group gap="xs">
                    <Text size="xs" c="dimmed">{filtered.length} event{filtered.length !== 1 ? 's' : ''}</Text>
                    <Tooltip label={paused ? 'Resume capture' : 'Pause capture'} color={paused ? 'teal' : 'orange'}>
                        <Button
                            size="xs"
                            variant="light"
                            color={paused ? 'teal' : 'orange'}
                            onClick={() => setPaused(p => !p)}
                        >
                            {paused ? 'Resume' : 'Pause'}
                        </Button>
                    </Tooltip>
                    <Tooltip label="Clear events">
                        <Button size="xs" variant="light" color="gray" leftSection={<MdClearAll size={14} />} onClick={() => setEvents([])}>
                            Clear
                        </Button>
                    </Tooltip>
                    <Tooltip label={autoScroll ? 'Disable auto-scroll' : 'Enable auto-scroll'}>
                        <Button size="xs" variant="light" color={autoScroll ? 'blue' : 'gray'} onClick={() => setAutoScroll(a => !a)}>
                            Auto-scroll
                        </Button>
                    </Tooltip>
                </Group>
            </Group>

            <ScrollArea h={340} viewportRef={viewport} style={{ fontFamily: 'monospace', fontSize: 12 }}>
                {filtered.length === 0 ? (
                    <Box p="md" style={{ textAlign: 'center' }}>
                        <Text c="dimmed" size="sm">No traffic events yet. Start the service to capture traffic.</Text>
                    </Box>
                ) : (
                    filtered.map((ev) => (
                        <Box
                            key={ev._id}
                            py={3}
                            px="xs"
                            style={{
                                borderBottom: '1px solid var(--mantine-color-dark-5)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                flexWrap: 'wrap',
                            }}
                        >
                            <Code style={{ fontSize: 10, flexShrink: 0 }}>{formatTime(ev.timestamp)}</Code>
                            <Box style={{ flexShrink: 0 }}>{eventTypeBadge(ev.event_type)}</Box>
                            <Text size="xs" style={{ flexShrink: 0, minWidth: 200 }}>{connStr(ev)}</Text>
                            {ev.filter_name && (
                                <Badge size="xs" color="violet" radius="sm" variant="dot">{ev.filter_name}</Badge>
                            )}
                        </Box>
                    ))
                )}
            </ScrollArea>
        </Box>
    );
}
