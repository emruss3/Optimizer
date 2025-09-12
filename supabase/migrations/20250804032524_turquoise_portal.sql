/*
  # Database Cleanup - Remove Duplicates and Add Idempotency
  
  1. Function Cleanup
    - Remove duplicate update_updated_at_column function
    - Add proper DROP IF EXISTS guards
  
  2. Rollback Support
    - Add rollback sections for each operation
*/

-- Drop and recreate update_updated_at_column function (remove duplicates)
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create or replace calc_irr function with better error handling
DROP FUNCTION IF EXISTS calc_irr(text) CASCADE;

CREATE OR REPLACE FUNCTION calc_irr(params text)
RETURNS json AS $$
DECLARE
    input_data json;
    land_cost numeric;
    hard_cost numeric;
    soft_cost numeric;
    loan_amount numeric;
    revenue numeric;
    development_months integer;
    
    total_cost numeric;
    equity_required numeric;
    profit numeric;
    
    irr_result numeric := 0;
    yield_on_cost numeric := 0;
    equity_multiple numeric := 0;
    cash_on_cash numeric := 0;
    
    result json;
BEGIN
    -- Parse input JSON
    BEGIN
        input_data := params::json;
    EXCEPTION WHEN OTHERS THEN
        RETURN json_build_object('error', 'Invalid JSON input parameters');
    END;
    
    -- Extract parameters with defaults
    land_cost := COALESCE((input_data->>'land_cost')::numeric, 0);
    hard_cost := COALESCE((input_data->>'hard_cost')::numeric, 0);
    soft_cost := COALESCE((input_data->>'soft_cost')::numeric, 0);
    loan_amount := COALESCE((input_data->>'loan_amount')::numeric, 0);
    revenue := COALESCE((input_data->>'revenue')::numeric, 0);
    development_months := COALESCE((input_data->>'development_months')::integer, 18);
    
    -- Validate inputs
    IF land_cost < 0 OR hard_cost < 0 OR soft_cost < 0 OR loan_amount < 0 OR revenue < 0 THEN
        RETURN json_build_object('error', 'Invalid input parameters: negative values not allowed');
    END IF;
    
    -- Calculate core metrics
    total_cost := land_cost + hard_cost + soft_cost;
    equity_required := total_cost - loan_amount;
    profit := revenue - total_cost;
    
    -- Prevent division by zero
    IF total_cost = 0 OR equity_required = 0 OR development_months = 0 THEN
        RETURN json_build_object(
            'error', 'Division by zero prevented',
            'irr', 0,
            'yield_on_cost', 0,
            'equity_multiple', 0,
            'cash_on_cash', 0,
            'total_cost', total_cost,
            'profit', profit,
            'equity_required', equity_required
        );
    END IF;
    
    -- Calculate IRR (simplified annual calculation)
    irr_result := LEAST(500, GREATEST(-100, (profit / equity_required) / (development_months / 12.0) * 100));
    
    -- Calculate other metrics
    yield_on_cost := (profit / total_cost) * 100;
    equity_multiple := revenue / equity_required;
    cash_on_cash := (profit / equity_required) * 100;
    
    -- Cap extreme values
    irr_result := LEAST(500, GREATEST(-100, irr_result));
    yield_on_cost := LEAST(1000, GREATEST(-100, yield_on_cost));
    equity_multiple := LEAST(50, GREATEST(0, equity_multiple));
    cash_on_cash := LEAST(1000, GREATEST(-100, cash_on_cash));
    
    RETURN json_build_object(
        'irr', irr_result,
        'yield_on_cost', yield_on_cost,
        'equity_multiple', equity_multiple,
        'cash_on_cash', cash_on_cash,
        'total_cost', total_cost,
        'profit', profit,
        'equity_required', equity_required
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'error', 'Calculation error: ' || SQLERRM,
        'irr', 0,
        'yield_on_cost', 0,
        'equity_multiple', 0,
        'cash_on_cash', 0,
        'total_cost', 0,
        'profit', 0,
        'equity_required', 0
    );
END;
$$ LANGUAGE plpgsql;

-- Create or replace get_default_costs function  
DROP FUNCTION IF EXISTS get_default_costs(text) CASCADE;

CREATE OR REPLACE FUNCTION get_default_costs(zoning_input text)
RETURNS json AS $$
DECLARE
    result json;
BEGIN
    -- Try to find specific zoning data
    SELECT json_build_object(
        'use_type', use_type,
        'land_cost_per_acre', COALESCE(land_cost_per_acre, 500000),
        'hard_cost_per_sf', COALESCE(hard_cost_per_sf, 180),
        'soft_cost_percentage', COALESCE(soft_cost_percentage, 20),
        'contingency_percentage', COALESCE(contingency_percentage, 10),
        'loan_to_cost', COALESCE(loan_to_cost, 75),
        'interest_rate', COALESCE(interest_rate, 7.5),
        'rent_per_sf_per_month', COALESCE(rent_per_sf_per_month, 1.80),
        'sale_price_per_sf', COALESCE(sale_price_per_sf, 320),
        'rent_per_unit_per_month', COALESCE(rent_per_unit_per_month, 1800),
        'sale_price_per_unit', COALESCE(sale_price_per_unit, 350000),
        'vacancy_rate', COALESCE(vacancy_rate, 5.0),
        'operating_expense_ratio', COALESCE(operating_expense_ratio, 35.0),
        'cap_rate', COALESCE(cap_rate, 5.5),
        'development_months', COALESCE(development_months, 18),
        'lease_up_months', COALESCE(lease_up_months, 6)
    ) INTO result
    FROM default_costs_by_use 
    WHERE use_type = zoning_input OR region = zoning_input
    LIMIT 1;
    
    -- Return default if no match found
    IF result IS NULL THEN
        result := json_build_object(
            'use_type', 'General',
            'land_cost_per_acre', 500000,
            'hard_cost_per_sf', 180,
            'soft_cost_percentage', 20,
            'contingency_percentage', 10,
            'loan_to_cost', 75,
            'interest_rate', 7.5,
            'rent_per_sf_per_month', 1.80,
            'sale_price_per_sf', 320,
            'rent_per_unit_per_month', 1800,
            'sale_price_per_unit', 350000,
            'vacancy_rate', 5.0,
            'operating_expense_ratio', 35.0,
            'cap_rate', 5.5,
            'development_months', 18,
            'lease_up_months', 6
        );
    END IF;
    
    RETURN result;
    
EXCEPTION WHEN OTHERS THEN
    -- Return safe defaults on any error
    RETURN json_build_object(
        'use_type', 'General',
        'land_cost_per_acre', 500000,
        'hard_cost_per_sf', 180,
        'soft_cost_percentage', 20,
        'contingency_percentage', 10,
        'loan_to_cost', 75,
        'interest_rate', 7.5,
        'rent_per_sf_per_month', 1.80,
        'sale_price_per_sf', 320,
        'rent_per_unit_per_month', 1800,
        'sale_price_per_unit', 350000,
        'vacancy_rate', 5.0,
        'operating_expense_ratio', 35.0,
        'cap_rate', 5.5,
        'development_months', 18,
        'lease_up_months', 6
    );
END;
$$ LANGUAGE plpgsql;

/*
-- ROLLBACK SECTION --
-- To rollback these changes:

DROP FUNCTION IF EXISTS calc_irr(text) CASCADE;
DROP FUNCTION IF EXISTS get_default_costs(text) CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Then restore previous versions if needed
*/