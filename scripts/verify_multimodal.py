import sys
import os
# Mock pydantic
from unittest.mock import MagicMock
pydantic_mock = MagicMock()
class BaseModel:
    pass
pydantic_mock.BaseModel = BaseModel
sys.modules["pydantic"] = pydantic_mock

# Mock dependencies
from unittest.mock import MagicMock
sys.modules["asyncpg"] = MagicMock()
sys.modules["fastapi"] = MagicMock()
sys.modules["fastapi.responses"] = MagicMock()
sys.modules["fastapi.middleware.cors"] = MagicMock()
sys.modules["fastapi.staticfiles"] = MagicMock()
sys.modules["pydantic_settings"] = MagicMock()
sys.modules["sqlalchemy"] = MagicMock()
sys.modules["google"] = MagicMock()
sys.modules["google.genai"] = MagicMock()
sys.modules["supabase"] = MagicMock()
sys.modules["python_magic"] = MagicMock()
sys.modules["PIL"] = MagicMock()
sys.modules["httpx"] = MagicMock()

# Add project root to path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(current_dir)
sys.path.insert(0, project_root)
print(f"Added to path: {project_root}")

# Mock backend.storage since it is imported in main
sys.modules["backend.storage"] = MagicMock()
sys.modules["backend.social_adapter"] = MagicMock()

try:
    from backend.main import BrandGenerate
    print("Successfully imported BrandGenerate from backend.main")
    
    # Check annotations since we are mocking BaseModel
    fields = BrandGenerate.__annotations__.keys()
    required = {"brand_context", "url", "logo_url"}
    
    if required.issubset(fields):
        print(f"PASS: BrandGenerate has required fields: {required}")
    else:
        print(f"FAIL: BrandGenerate missing fields. Found: {fields}")
        sys.exit(1)

    from execution import scraper, generator
    print("Successfully imported execution.scraper and execution.generator")
    
except ImportError as e:
    print(f"ImportError: {e}")
    sys.exit(1)
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
