from __future__ import annotations

from datetime import date
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

Money = Annotated[int, Field(strict=True, ge=0, le=100_000_000_000)]
GuestCount = Annotated[int, Field(strict=True, ge=1, le=100_000)]
Category = Literal['food', 'venue', 'decor', 'photography', 'entertainment', 'logistics', 'other']
Priority = Literal['high', 'medium', 'low']


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class EventInput(StrictModel):
    name: str = Field(min_length=1, max_length=160)
    occasion: str = Field(min_length=1, max_length=100)
    city: str = Field(min_length=1, max_length=160)
    event_date: date
    budget_paise: Annotated[int, Field(strict=True, ge=100, le=100_000_000_000)]
    guest_count: GuestCount
    atmosphere: str = Field(default='', max_length=400)
    theme: str = Field(default='', max_length=400)
    priorities: list[str] = Field(default_factory=lambda: ['food', 'venue', 'decor', 'photography'], max_length=12)
    non_negotiables: list[str] = Field(default_factory=list, max_length=20)
    dietary_preferences: str = Field(default='', max_length=1000)
    accessibility_needs: str = Field(default='', max_length=1000)
    cultural_preferences: str = Field(default='', max_length=1000)

    @field_validator('priorities', 'non_negotiables')
    @classmethod
    def clean_list(cls, value):
        if any(not item.strip() or len(item) > 300 for item in value):
            raise ValueError('List entries must contain 1–300 characters.')
        return list(dict.fromkeys(item.strip() for item in value))

    @field_validator('priorities')
    @classmethod
    def normalize_priorities(cls, value):
        aliases = {'decoration': 'decor', 'catering': 'food', 'guest comfort': 'logistics'}
        normalized = [aliases.get(item.casefold(), item.casefold()) for item in value]
        allowed = {'food', 'venue', 'decor', 'photography', 'entertainment', 'logistics', 'other'}
        if any(item not in allowed for item in normalized):
            raise ValueError('Priorities must use supported planning categories.')
        return list(dict.fromkeys(normalized))


class Changes(StrictModel):
    guest_count: Optional[GuestCount] = None
    budget_paise: Optional[Annotated[int, Field(strict=True, ge=100, le=100_000_000_000)]] = None
    event_date: Optional[date] = None
    priorities: Optional[list[str]] = Field(default=None, min_length=1, max_length=12)

    @field_validator('priorities')
    @classmethod
    def clean_priorities(cls, value):
        if value is not None:
            return EventInput.normalize_priorities(EventInput.clean_list(value))
        return value


class BudgetInput(StrictModel):
    category: Category
    label: str = Field(min_length=1, max_length=160)
    cost_type: Literal['fixed', 'per_person']
    estimate_paise: Money
    quoted_paise: Optional[Money] = None
    committed_paise: Optional[Money] = None
    actual_paise: Optional[Money] = None
    quote_guest_count: Optional[GuestCount] = None
    source: Literal['estimate', 'user'] = 'user'
    notes: str = Field(default='', max_length=4000)


class BudgetPatch(StrictModel):
    category: Optional[Category] = None
    label: Optional[str] = Field(default=None, min_length=1, max_length=160)
    cost_type: Optional[Literal['fixed', 'per_person']] = None
    estimate_paise: Optional[Money] = None
    quoted_paise: Optional[Money] = None
    committed_paise: Optional[Money] = None
    actual_paise: Optional[Money] = None
    quote_guest_count: Optional[GuestCount] = None
    source: Optional[Literal['estimate', 'user']] = None
    notes: Optional[str] = Field(default=None, max_length=4000)
    expected_version: Optional[Annotated[int, Field(strict=True, ge=1)]] = None


class TaskInput(StrictModel):
    title: str = Field(min_length=1, max_length=240)
    due_date: date
    priority: Priority = 'medium'
    status: Literal['todo', 'in_progress', 'done'] = 'todo'
    dependencies: list[str] = Field(default_factory=list, max_length=50)
    notes: str = Field(default='', max_length=4000)


class TaskPatch(StrictModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=240)
    due_date: Optional[date] = None
    priority: Optional[Priority] = None
    status: Optional[Literal['todo', 'in_progress', 'done']] = None
    dependencies: Optional[list[str]] = Field(default=None, max_length=50)
    notes: Optional[str] = Field(default=None, max_length=4000)
    expected_version: Optional[Annotated[int, Field(strict=True, ge=1)]] = None


class VendorInput(StrictModel):
    name: str = Field(min_length=1, max_length=160)
    category: Category
    quoted_paise: Money
    guests_covered: Optional[GuestCount] = None
    inclusions: str = Field(default='', max_length=4000)
    exclusions: str = Field(default='', max_length=4000)
    taxes_paise: Money = 0
    additional_charges_paise: Money = 0
    payment_terms: str = Field(default='', max_length=1000)
    availability: Literal['unknown', 'available', 'unavailable'] = 'unknown'
    booking_status: Literal['considering', 'contacted', 'booked'] = 'considering'
    sample: bool = False
    notes: str = Field(default='', max_length=4000)


class VendorPatch(StrictModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=160)
    category: Optional[Category] = None
    quoted_paise: Optional[Money] = None
    guests_covered: Optional[GuestCount] = None
    inclusions: Optional[str] = Field(default=None, max_length=4000)
    exclusions: Optional[str] = Field(default=None, max_length=4000)
    taxes_paise: Optional[Money] = None
    additional_charges_paise: Optional[Money] = None
    payment_terms: Optional[str] = Field(default=None, max_length=1000)
    availability: Optional[Literal['unknown', 'available', 'unavailable']] = None
    booking_status: Optional[Literal['considering', 'contacted', 'booked']] = None
    sample: Optional[bool] = None
    notes: Optional[str] = Field(default=None, max_length=4000)
    expected_version: Optional[Annotated[int, Field(strict=True, ge=1)]] = None


class ProposalInput(StrictModel):
    message: str = Field(min_length=3, max_length=4000)
    request_id: str = Field(min_length=8, max_length=128, pattern=r'^[a-zA-Z0-9_-]+$')


class CompareInput(StrictModel):
    vendor_ids: list[str] = Field(min_length=2, max_length=6)


class RestoreInput(StrictModel):
    expected_version: Annotated[int, Field(strict=True, ge=1)]
