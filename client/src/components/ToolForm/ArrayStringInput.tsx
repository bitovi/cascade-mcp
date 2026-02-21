/**
 * Array String Input Component
 * 
 * Provides a user-friendly interface for array-of-strings tool parameters.
 * Replaces error-prone JSON textarea with individual text inputs and add/remove buttons.
 */

import { useState, useEffect, useRef } from 'react';

interface ArrayStringInputProps {
  id: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  required?: boolean;
  error?: string;
  description?: string;
  minLength?: number;
  maxLength?: number;
  validateUrl?: boolean;
  disabled?: boolean;
  label?: string;
}

export function ArrayStringInput({
  id,
  value,
  onChange,
  placeholder = '',
  required = false,
  error,
  description,
  minLength,
  disabled = false,
  validateUrl = false,
  label,
}: ArrayStringInputProps) {
  // Ensure we always have at least one input field
  const [items, setItems] = useState<string[]>(value.length > 0 ? value : ['']);
  const prevValueRef = useRef<string[]>(value);

  // Sync with parent value changes
  useEffect(() => {
    // Only sync if value actually changed (not just on re-render)
    const valueChanged = JSON.stringify(prevValueRef.current) !== JSON.stringify(value);
    
    if (valueChanged) {
      prevValueRef.current = value;
      
      // Skip if both parent value and local items are empty (initial state)
      const valueIsEmpty = value.length === 0;
      const itemsIsEmpty = items.length === 1 && items[0] === '';
      
      if (valueIsEmpty && itemsIsEmpty) {
        // Don't update if we just have an empty initial state
        return;
      }
      
      setItems(value.length > 0 ? value : ['']);
    }
  }, [value, items]);

  const handleItemChange = (index: number, newValue: string) => {
    const newItems = [...items];
    newItems[index] = newValue;
    setItems(newItems);
    
    // Filter out empty strings for the onChange callback (unless it's the only item)
    const filteredItems = newItems.filter(item => item.trim() !== '');
    onChange(filteredItems.length > 0 ? filteredItems : []);
  };

  const handleAddItem = () => {
    const newItems = [...items, ''];
    setItems(newItems);
    // Don't call onChange yet - wait for user to type
  };

  const handleRemoveItem = (index: number) => {
    if (items.length === 1) {
      // Keep at least one input, just clear it
      setItems(['']);
      onChange([]);
      return;
    }
    
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
    
    // Filter out empty strings
    const filteredItems = newItems.filter(item => item.trim() !== '');
    onChange(filteredItems.length > 0 ? filteredItems : []);
  };

  const inputClasses = `w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
    error ? 'border-red-500' : 'border-gray-300'
  }`;

  const labelClasses = "block text-sm font-medium text-gray-700 mb-1";

  return (
    <div className="mb-4">
      {label && (
        <label htmlFor={`${id}-0`} className={labelClasses}>
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      {description && (
        <p className="text-xs text-gray-500 mb-2">{description}</p>
      )}
      
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex gap-2">
            <input
              id={index === 0 ? `${id}-0` : undefined}
              type={validateUrl ? 'url' : 'text'}
              value={item}
              onChange={(e) => handleItemChange(index, e.target.value)}
              placeholder={placeholder || (validateUrl ? 'https://...' : '')}
              disabled={disabled}
              className={inputClasses}
            />
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => handleRemoveItem(index)}
                disabled={disabled}
                className="px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed transition-colors"
                aria-label={`Remove item ${index + 1}`}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      
      <button
        type="button"
        onClick={handleAddItem}
        disabled={disabled}
        className="mt-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm"
      >
        + Add another
      </button>
      
      {minLength && minLength > 0 && (
        <p className="text-xs text-gray-500 mt-1">
          Minimum {minLength} item{minLength !== 1 ? 's' : ''} required
        </p>
      )}
      
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}
