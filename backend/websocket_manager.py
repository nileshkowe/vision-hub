from fastapi import WebSocket
from typing import List

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        """Accept WebSocket connection and add to active connections"""
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        """Remove WebSocket from active connections"""
        try:
            self.active_connections.remove(websocket)
        except ValueError:
            # WebSocket not in list, already disconnected
            pass

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                # Handle disconnected clients gracefully
                self.active_connections.remove(connection)

manager = ConnectionManager()
