import pytest
import json
from supabase import create_client, Client

# Test configuration
SUPABASE_URL = "https://okxrvetbzpoazrybhcqj.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9reHJ2ZXRienBvYXpyeWJoY3FqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY1ODkxNDcsImV4cCI6MjA2MjE2NTE0N30.diq6x_Kr5_GxPSHJT1gm54Jh2UTiGVrBNgxDmV3yMxI"

@pytest.fixture
def supabase_client():
    """Create Supabase client for testing"""
    return create_client(SUPABASE_URL, SUPABASE_KEY)

class TestCalcIRR:
    """Test suite for calc_irr RPC function"""
    
    def test_valid_calculation(self, supabase_client: Client):
        """Test normal IRR calculation"""
        params = {
            "land_cost": 500000,
            "hard_cost": 2000000,
            "soft_cost": 400000,
            "loan_amount": 2175000,
            "revenue": 3500000,
            "development_months": 18
        }
        
        response = supabase_client.rpc('calc_irr', {'params': json.dumps(params)}).execute()
        
        assert response.data is not None
        result = response.data
        
        # Check required fields exist
        assert 'irr' in result
        assert 'yield_on_cost' in result
        assert 'equity_multiple' in result
        assert 'cash_on_cash' in result
        
        # Check reasonable values
        assert result['irr'] > 0
        assert result['irr'] < 100  # Should be reasonable
        assert result['equity_multiple'] > 1
        assert 'error' not in result
    
    def test_divide_by_zero_edge_case(self, supabase_client: Client):
        """Test divide-by-zero prevention"""
        params = {
            "land_cost": 0,
            "hard_cost": 0,
            "soft_cost": 0,
            "loan_amount": 0,
            "revenue": 0,
            "development_months": 0
        }
        
        response = supabase_client.rpc('calc_irr', {'params': json.dumps(params)}).execute()
        
        assert response.data is not None
        result = response.data
        
        # Should handle gracefully with error message
        assert 'error' in result
        assert result['irr'] == 0
        assert result['yield_on_cost'] == 0
    
    def test_negative_values(self, supabase_client: Client):
        """Test negative input validation"""
        params = {
            "land_cost": -100000,
            "hard_cost": 2000000,
            "soft_cost": 400000,
            "loan_amount": 2175000,
            "revenue": -500000,  # Negative revenue
            "development_months": 18
        }
        
        response = supabase_client.rpc('calc_irr', {'params': json.dumps(params)}).execute()
        
        assert response.data is not None
        result = response.data
        
        # Should reject negative inputs
        assert 'error' in result
        assert 'Invalid input parameters' in result['error']
    
    def test_extreme_values(self, supabase_client: Client):
        """Test extreme value handling"""
        params = {
            "land_cost": 1000,  # Very low land cost
            "hard_cost": 100,   # Very low hard cost
            "soft_cost": 0,
            "loan_amount": 500,
            "revenue": 10000000,  # Very high revenue
            "development_months": 1  # Very short timeline
        }
        
        response = supabase_client.rpc('calc_irr', {'params': json.dumps(params)}).execute()
        
        assert response.data is not None
        result = response.data
        
        # Should cap extreme IRR values
        if 'error' not in result:
            assert result['irr'] <= 500  # Capped at 500%
            assert result['irr'] >= -100  # Capped at -100%
    
    def test_json_malformed(self, supabase_client: Client):
        """Test malformed JSON handling"""
        # This should be handled by PostgreSQL JSON validation
        try:
            response = supabase_client.rpc('calc_irr', {'params': 'invalid-json'}).execute()
            # If it doesn't throw, check for error in response
            if response.data:
                assert 'error' in response.data
        except Exception:
            # Expected - malformed JSON should be rejected
            pass

class TestGetDefaultCosts:
    """Test suite for get_default_costs RPC function"""
    
    def test_known_zoning_lookup(self, supabase_client: Client):
        """Test lookup for known zoning code"""
        response = supabase_client.rpc('get_default_costs', {'zoning_input': 'RM15'}).execute()
        
        assert response.data is not None
        result = response.data
        
        # Check required cost fields
        assert 'hard_cost_per_sf' in result
        assert 'interest_rate' in result
        assert 'sale_price_per_unit' in result
        assert result['hard_cost_per_sf'] > 0
    
    def test_unknown_zoning_fallback(self, supabase_client: Client):
        """Test fallback for unknown zoning code"""
        response = supabase_client.rpc('get_default_costs', {'zoning_input': 'UNKNOWN_ZONE'}).execute()
        
        assert response.data is not None
        result = response.data
        
        # Should return default values
        assert result['use_type'] == 'General'
        assert result['hard_cost_per_sf'] == 180  # Default fallback
        assert result['interest_rate'] == 7.5     # Default fallback

if __name__ == "__main__":
    pytest.main([__file__, "-v"])