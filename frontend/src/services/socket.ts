type MessageHandler = (payload: any) => void;

class SocketService {
	private socket: WebSocket | null = null;
	private url: string;
	private listeners: Record<string, MessageHandler[]> = {};
	private reconnectInterval = 3000;
	private shouldReconnect = true;

	constructor() {
		// Determine WS URL from current window location or VITE env
		// In production/docker, everything is proxied through /api
		const wsUrl =
			(window.location.protocol === "https:" ? "wss://" : "ws://") +
			window.location.host +
			"/api/ws";
		this.url = wsUrl;
	}

	public connect() {
		if (
			this.socket &&
			(this.socket.readyState === WebSocket.OPEN ||
				this.socket.readyState === WebSocket.CONNECTING)
		) {
			return;
		}

		console.log("Connecting to WebSocket:", this.url);
		this.socket = new WebSocket(this.url);

		this.socket.onopen = () => {
			console.log("WebSocket Connected");
			// Maybe send an initial ping?
		};

		this.socket.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				const { type, payload } = data;

				if (type && this.listeners[type]) {
					this.listeners[type].forEach((handler) => handler(payload));
				}
			} catch (e) {
				console.error("WS Parse Error", e);
			}
		};

		this.socket.onclose = () => {
			console.log("WebSocket Disconnected");
			if (this.shouldReconnect) {
				setTimeout(() => this.connect(), this.reconnectInterval);
			}
		};

		this.socket.onerror = (error) => {
			console.error("WebSocket Error", error);
			this.socket?.close();
		};
	}

	public disconnect() {
		this.shouldReconnect = false;
		this.socket?.close();
	}

	public on(type: string, handler: MessageHandler) {
		if (!this.listeners[type]) {
			this.listeners[type] = [];
		}
		this.listeners[type].push(handler);
	}

	public off(type: string, handler: MessageHandler) {
		if (!this.listeners[type]) return;
		this.listeners[type] = this.listeners[type].filter(
			(h) => h !== handler,
		);
	}
}

const socketService = new SocketService();
export default socketService;
