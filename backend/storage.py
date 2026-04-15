import os
import uuid
import shutil
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Union, BinaryIO
import logging

logger = logging.getLogger(__name__)

class StorageProvider(ABC):
    @abstractmethod
    def upload(self, file_data: Union[bytes, BinaryIO], filename: str, content_type: str) -> str:
        """Uploads file and returns public URL"""
        pass

class LocalStorageProvider(StorageProvider):
    def __init__(self, base_url: str = None):
        self.base_url = base_url or os.getenv("PUBLIC_URL", "http://localhost:8000")
        self.upload_dir = Path("uploads")
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        # Also ensure generated_images exists as we might map it differently or treat all as uploads
        self.gen_dir = Path("generated_images")
        self.gen_dir.mkdir(parents=True, exist_ok=True)

    def upload(self, file_data: Union[bytes, BinaryIO], filename: str, content_type: str) -> str:
        # Determine target directory based on context or just put everything in uploads?
        # For simplicity in this adapter, we'll put everything in 'uploads' unless it looks like a generation
        # But to match current behavior:
        # - User uploads -> uploads/
        # - AI generations -> generated_images/
        # We can detect this or just unify. Let's unify to 'uploads' for Cloud compatibility, 
        # but locally keep consistent if possible.
        
        target_dir = self.upload_dir
        # If it's a generation (usually passed as bytes with a specific name pattern?), let's just use uploads for all new storage
        # to simplify the "Cloud" migration mental model.
        
        file_path = target_dir / filename
        
        if isinstance(file_data, bytes):
            with open(file_path, "wb") as f:
                f.write(file_data)
        else:
            # It's a file-like object
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file_data, buffer)
                
        return f"{self.base_url}/uploads/{filename}"

class SupabaseStorageProvider(StorageProvider):
    def __init__(self, url: str, key: str, bucket: str = "content-assets"):
        from supabase import create_client, Client
        self.supabase: Client = create_client(url, key)
        self.bucket = bucket

    def upload(self, file_data: Union[bytes, BinaryIO], filename: str, content_type: str) -> str:
        try:
            # Supabase storage upload expects bytes
            if not isinstance(file_data, bytes):
                # If it's a file-like object, read it
                file_data.seek(0)
                data = file_data.read()
            else:
                data = file_data

            self.supabase.storage.from_(self.bucket).upload(
                path=filename,
                file=data,
                file_options={"content-type": content_type}
            )
            
            # Get public URL
            public_url_response = self.supabase.storage.from_(self.bucket).get_public_url(filename)
            # Depending on supabase-py version, checking return type
            # usually returns a string or an object with 'publicUrl' if strictly typed? 
            # The method signature generally returns string in recent versions
            return public_url_response
            
        except Exception as e:
            logger.error(f"Supabase Upload Failed: {e}")
            raise e

def get_storage_provider() -> StorageProvider:
    provider_type = os.getenv("STORAGE_PROVIDER", "local").lower()
    
    if provider_type == "supabase":
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_KEY")
        bucket = os.getenv("SUPABASE_BUCKET", "content-assets")
        
        if not url or not key:
            logger.warning("Supabase credentials missing! Falling back to Local Storage.")
            return LocalStorageProvider()
            
        return SupabaseStorageProvider(url, key, bucket)
    
    return LocalStorageProvider()
