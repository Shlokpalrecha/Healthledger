from pydantic import BaseModel, Field


class HealthInputs(BaseModel):
    age: float = Field(..., ge=18, le=95)
    bmi: float = Field(..., ge=14, le=50)
    smoking: int = Field(..., ge=0, le=1)
    alcohol: int = Field(..., ge=0, le=1)
    exercise: float = Field(..., ge=0, le=7)
    family_history: int = Field(..., ge=0, le=1)
