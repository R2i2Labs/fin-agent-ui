import os
from pathlib import Path
import sqlite3
import json
import sys
from typing import List, Dict, Any, Optional
from contextlib import contextmanager

class DatabaseManager:
    def __init__(self, db_path=None):
        if db_path is None:
            # If running from an AppImage or bundle, place DB in user config dir
            user_data_dir = self._get_user_data_dir()
            os.makedirs(user_data_dir, exist_ok=True)
            db_path = os.path.join(user_data_dir, "agent_memory.db")

            # If the DB doesn't exist, copy the original read-only one
            default_db = os.path.join(os.path.dirname(__file__), "agent_memory.db")
            if os.path.exists(default_db) and not os.path.exists(db_path):
                import shutil
                shutil.copyfile(default_db, db_path)

        self.db_path = db_path
        self._initialize_db()
        
    def _get_user_data_dir(self):
        """Determine a writable directory for storing app data."""
        if sys.platform == "win32":
            return os.path.join(os.environ["APPDATA"], "FinanceAgent")
        elif sys.platform == "darwin":
            return os.path.join(Path.home(), "Library", "Application Support", "FinanceAgent")
        else:  # Linux and others
            return os.path.join(Path.home(), ".config", "FinanceAgent")
    
    def _initialize_db(self):
        """Create the necessary tables if they don't exist."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            
            # Create conversations table
            cursor.execute('''
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY,
                agent_id TEXT NOT NULL,
                name TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            ''')
            
            # Create messages table
            cursor.execute('''
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY,
                conversation_id INTEGER NOT NULL,
                message_type TEXT NOT NULL,
                content TEXT NOT NULL,
                role TEXT,
                call_id TEXT,
                function_name TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                extra_data TEXT,
                FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
            )
            ''')
            
            conn.commit()
    
    @contextmanager
    def _get_connection(self):
        """Context manager for database connections."""
        conn = sqlite3.connect(self.db_path)
        try:
            yield conn
        finally:
            conn.close()
    
    def create_conversation(self, name: str, agent_id: str) -> int:
        """Create a new conversation and return its ID."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO conversations (name, agent_id) VALUES (?,?)",
                (name, agent_id,)
            )
            conn.commit()
            return cursor.lastrowid
    
    def get_conversation(self, conversation_id: int) -> Optional[Dict]:
        """Get conversation details by ID."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, name, agent_id, created_at, last_updated FROM conversations WHERE id = ?",
                (conversation_id,)
            )
            row = cursor.fetchone()
            
            if not row:
                return None
                
            return {
                "id": row[0],
                "name": row[1],
                "agent_id": row[2],
                "created_at": row[3],
                "last_updated": row[4]
            }
    
    def save_message(self, conversation_id: int, message: Dict[str, Any]) -> int:
        """Save a message to the database."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            # Update the last_updated timestamp of the conversation
            cursor.execute(
                "UPDATE conversations SET last_updated = CURRENT_TIMESTAMP WHERE id = ?",
                (conversation_id,)
            )
            # Extract message fields based on its type
            message_type = message.get("type", "message")
            # Default values
            role = None
            call_id = None
            function_name = None
            content = ""
            extra_data = message.get("extra_data")  # Get extra_data if available
            
            if message_type == "message":
                role = message.get("role")
                content = message.get("content", "")
            elif message_type == "function_call":
                call_id = message.get("call_id")
                function_name = message.get("name")
                content = message.get("arguments", {})
            elif message_type == "function_call_output":
                call_id = message.get("call_id")
                content = str(message.get("output", ""))
            else:
                # For any other type, serialize the whole message
                content = json.dumps(message)
            
            cursor.execute(
                """
                INSERT INTO messages
                (conversation_id, message_type, content, role, call_id, function_name, extra_data)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (conversation_id, message_type, content, role, call_id, function_name, extra_data)
            )
            conn.commit()
            return cursor.lastrowid

    def get_messages_for_conversation(self, conversation_id: int):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, conversation_id, message_type, content, role, call_id, function_name, timestamp, extra_data FROM messages WHERE conversation_id = ? ORDER BY timestamp",
                (conversation_id,)
            )
            messages = []
            for row in cursor.fetchall():
                messages.append({
                    "id": row[0],
                    "conversation_id": row[1],
                    "message_type": row[2],
                    "content": row[3],
                    "role": row[4],
                    "call_id": row[5],
                    "function_name": row[6],
                    "timestamp": row[7],
                    "extra_data": row[8]
                })
            return messages
    
    def get_messages(self, conversation_id: int) -> List[Dict[str, Any]]:
        """Get all messages for a conversation in chronological order."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT id, message_type, content, role, call_id, function_name, timestamp, extra_data
                FROM messages
                WHERE conversation_id = ?
                ORDER BY id ASC
                """,
                (conversation_id,)
            )
            
            messages = []
            for row in cursor.fetchall():
                message = {
                    "id": row[0],
                    "type": row[1],
                    "timestamp": row[6],
                    "extra_data": row[7]
                }
                
                if row[1] == "message":
                    message["role"] = row[3]
                    message["content"] = row[2]
                elif row[1] == "function_call":
                    message["call_id"] = row[4]
                    message["name"] = row[5]
                    try:
                        message["arguments"] = json.loads(row[2])
                    except:
                        message["arguments"] = row[2]
                elif row[1] == "function_call_output":
                    message["call_id"] = row[4]
                    message["output"] = row[2]
                else:
                    # For other types, attempt to parse JSON
                    try:
                        other_fields = json.loads(row[2])
                        message.update(other_fields)
                    except:
                        message["content"] = row[2]
                
                messages.append(message)
            
            return messages
    
    def delete_conversation(self, conversation_id: int) -> bool:
        """Delete a conversation and all its messages."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
            conn.commit()
            return cursor.rowcount > 0
    
    def list_conversations(self, agent_id: Optional[str] = None) -> List[Dict]:
        """List all conversations, optionally filtered by agent_id."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            
            if agent_id:
                cursor.execute(
                    """
                    SELECT id, name, agent_id, created_at, last_updated 
                    FROM conversations 
                    WHERE agent_id = ?
                    ORDER BY last_updated DESC
                    """,
                    (agent_id,)
                )
            else:
                cursor.execute(
                    """
                    SELECT id, agent_id, created_at, last_updated 
                    FROM conversations
                    ORDER BY last_updated DESC
                    """
                )
            
            return [
                {
                    "id": row[0],
                    "name": row[1],
                    "agent_id": row[2],
                    "created_at": row[3],
                    "last_updated": row[4],
                    "messages": []
                }
                for row in cursor.fetchall()
            ]
            
    def get_messages_for_openai(self, conversation_id: int) -> List[Dict[str, Any]]:
        """Get all messages for a conversation formatted for OpenAI API."""
        messages = self.get_messages(conversation_id)
        openai_messages = []
        
        for message in messages:
            if message["type"] == "message":
                openai_messages.append({
                    "role": message["role"],
                    "content": message["content"]
                })
        return openai_messages