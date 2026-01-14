from __future__ import annotations
from typing import Any, Dict, Optional
from pydantic import BaseModel


class ClientMessage(BaseModel):
    """Represents a message sent from the client."""
    type: str  # The type of the message
    payload: Dict[str, Any] = {}  # The data associated with the message


class ServerMessage(BaseModel):
    """Represents a message sent from the server."""
    type: str  # The type of the message
    payload: Dict[str, Any] = {}  # The data associated with the message
    to: Optional[str] = None  # The recipient of the message: "all" or "player:<id>" (optional)
