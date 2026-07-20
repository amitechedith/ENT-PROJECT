const clients = new Set();

const sendEvent = (res, event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
};

const realtimeEventsHandler = (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    clients.add(res);
    sendEvent(res, { type: 'connected', timestamp: new Date().toISOString() });

    req.on('close', () => {
        clients.delete(res);
        res.end();
    });
};

const publishRealtimeEvent = (event) => {
    const payload = {
        ...event,
        timestamp: new Date().toISOString()
    };

    for (const client of clients) {
        sendEvent(client, payload);
    }
};

module.exports = {
    realtimeEventsHandler,
    publishRealtimeEvent
};
