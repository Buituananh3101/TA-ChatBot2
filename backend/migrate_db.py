from sqlalchemy import text
from app.database import engine, Base
from app import models

def upgrade():
    # Khởi tạo các bảng mới (Notebook, NotebookSource, NotebookMindmap)
    Base.metadata.create_all(bind=engine)
    print("Created new tables.")

    with engine.connect() as conn:
        try:
            # Thêm cột notebook_id vào chat_sessions
            conn.execute(text("ALTER TABLE chat_sessions ADD COLUMN notebook_id INTEGER DEFAULT NULL;"))
            print("Added notebook_id to chat_sessions.")
        except Exception as e:
            if "Duplicate column name" in str(e):
                print("Column notebook_id already exists in chat_sessions.")
            else:
                print(f"Error adding column: {e}")
                
        try:
            # Thêm foreign key constraint
            conn.execute(text("ALTER TABLE chat_sessions ADD CONSTRAINT fk_chat_session_notebook FOREIGN KEY(notebook_id) REFERENCES notebooks(id) ON DELETE SET NULL;"))
            print("Added foreign key constraint to chat_sessions.")
        except Exception as e:
            if "Duplicate key name" in str(e) or "already exists" in str(e):
                print("Foreign key already exists.")
            else:
                print(f"Error adding foreign key: {e}")
                
        conn.commit()
    print("Database migration completed.")

if __name__ == "__main__":
    upgrade()
