/**
 * Tool Form Component
 * 
 * Dynamic form that generates input fields based on a tool's JSON Schema.
 * Uses Ajv for validation.
 */

import { useState, useMemo } from 'react';
import Ajv from 'ajv';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

interface ToolFormProps {
  tool: Tool;
  onExecute: (args: Record<string, unknown>) => Promise<void>;
  isExecuting: boolean;
}

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  description?: string;
  enum?: string[];
  default?: unknown;
  items?: JsonSchema;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
}

const ajv = new Ajv({ allErrors: true, verbose: true });

export function ToolForm({ tool, onExecute, isExecuting }: ToolFormProps) {
  const schema = tool.inputSchema as JsonSchema;
  const properties = schema.properties || {};
  const required = schema.required || [];

  // Initialize form values from schema defaults
  const initialValues = useMemo(() => {
    const values: Record<string, unknown> = {};
    for (const [key, propSchema] of Object.entries(properties)) {
      if (propSchema.default !== undefined) {
        values[key] = propSchema.default;
      } else if (propSchema.type === 'boolean') {
        values[key] = false;
      } else if (propSchema.type === 'number' || propSchema.type === 'integer') {
        values[key] = '';
      } else if (propSchema.type === 'array') {
        values[key] = '[]';
      } else if (propSchema.type === 'object') {
        values[key] = '{}';
      } else {
        values[key] = '';
      }
    }
    return values;
  }, [tool.name]);

  const [values, setValues] = useState<Record<string, unknown>>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset form when tool changes
  useMemo(() => {
    setValues(initialValues);
    setErrors({});
  }, [tool.name, initialValues]);

  const handleChange = (key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    // Clear error for this field
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[key];
      return newErrors;
    });
  };

  const validate = (): boolean => {
    // Build the actual values object for validation
    const actualValues: Record<string, unknown> = {};
    
    for (const [key, propSchema] of Object.entries(properties)) {
      const value = values[key];
      
      if (propSchema.type === 'number' || propSchema.type === 'integer') {
        if (value !== '' && value !== undefined) {
          actualValues[key] = Number(value);
        }
      } else if (propSchema.type === 'boolean') {
        actualValues[key] = Boolean(value);
      } else if (propSchema.type === 'array' || propSchema.type === 'object') {
        try {
          if (typeof value === 'string' && value.trim()) {
            actualValues[key] = JSON.parse(value);
          }
        } catch {
          setErrors((prev) => ({ ...prev, [key]: 'Invalid JSON' }));
          return false;
        }
      } else if (value !== '' && value !== undefined) {
        actualValues[key] = value;
      }
    }

    const validate = ajv.compile(schema);
    const valid = validate(actualValues);

    if (!valid && validate.errors) {
      const newErrors: Record<string, string> = {};
      for (const error of validate.errors) {
        const path = error.instancePath.replace(/^\//, '') || error.params?.missingProperty;
        if (path) {
          newErrors[path] = error.message || 'Invalid value';
        }
      }
      setErrors(newErrors);
      return false;
    }

    setErrors({});
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) {
      return;
    }

    // Build the final arguments object
    const args: Record<string, unknown> = {};
    
    for (const [key, propSchema] of Object.entries(properties)) {
      const value = values[key];
      
      if (propSchema.type === 'number' || propSchema.type === 'integer') {
        if (value !== '' && value !== undefined) {
          args[key] = Number(value);
        }
      } else if (propSchema.type === 'boolean') {
        args[key] = Boolean(value);
      } else if (propSchema.type === 'array' || propSchema.type === 'object') {
        if (typeof value === 'string' && value.trim()) {
          args[key] = JSON.parse(value);
        }
      } else if (value !== '' && value !== undefined) {
        args[key] = value;
      }
    }

    await onExecute(args);
  };

  const renderField = (key: string, propSchema: JsonSchema) => {
    const isRequired = required.includes(key);
    const error = errors[key];
    const value = values[key];

    const labelClasses = "block text-sm font-medium text-gray-700 mb-1";
    const inputClasses = `w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
      error ? 'border-red-500' : 'border-gray-300'
    }`;

    // Handle enum as select
    if (propSchema.enum) {
      return (
        <div key={key} className="mb-4">
          <label htmlFor={key} className={labelClasses}>
            {key}
            {isRequired && <span className="text-red-500 ml-1">*</span>}
          </label>
          {propSchema.description && (
            <p className="text-xs text-gray-500 mb-1">{propSchema.description}</p>
          )}
          <select
            id={key}
            value={String(value || '')}
            onChange={(e) => handleChange(key, e.target.value)}
            className={inputClasses}
          >
            <option value="">-- Select --</option>
            {propSchema.enum.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
        </div>
      );
    }

    // Handle different types
    switch (propSchema.type) {
      case 'boolean':
        return (
          <div key={key} className="mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(value)}
                onChange={(e) => handleChange(key, e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className={labelClasses.replace('mb-1', '')}>
                {key}
                {isRequired && <span className="text-red-500 ml-1">*</span>}
              </span>
            </label>
            {propSchema.description && (
              <p className="text-xs text-gray-500 mt-1 ml-6">{propSchema.description}</p>
            )}
            {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
          </div>
        );

      case 'number':
      case 'integer':
        return (
          <div key={key} className="mb-4">
            <label htmlFor={key} className={labelClasses}>
              {key}
              {isRequired && <span className="text-red-500 ml-1">*</span>}
            </label>
            {propSchema.description && (
              <p className="text-xs text-gray-500 mb-1">{propSchema.description}</p>
            )}
            <input
              id={key}
              type="number"
              value={String(value || '')}
              onChange={(e) => handleChange(key, e.target.value)}
              min={propSchema.minimum}
              max={propSchema.maximum}
              step={propSchema.type === 'integer' ? 1 : 'any'}
              className={inputClasses}
            />
            {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
          </div>
        );

      case 'array':
      case 'object':
        return (
          <div key={key} className="mb-4">
            <label htmlFor={key} className={labelClasses}>
              {key}
              {isRequired && <span className="text-red-500 ml-1">*</span>}
              <span className="text-gray-400 font-normal ml-1">({propSchema.type})</span>
            </label>
            {propSchema.description && (
              <p className="text-xs text-gray-500 mb-1">{propSchema.description}</p>
            )}
            <textarea
              id={key}
              value={String(value || '')}
              onChange={(e) => handleChange(key, e.target.value)}
              rows={3}
              placeholder={propSchema.type === 'array' ? '[]' : '{}'}
              className={`${inputClasses} font-mono text-sm`}
            />
            {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
          </div>
        );

      default:
        // String and other types
        return (
          <div key={key} className="mb-4">
            <label htmlFor={key} className={labelClasses}>
              {key}
              {isRequired && <span className="text-red-500 ml-1">*</span>}
            </label>
            {propSchema.description && (
              <p className="text-xs text-gray-500 mb-1">{propSchema.description}</p>
            )}
            <input
              id={key}
              type={propSchema.format === 'email' ? 'email' : propSchema.format === 'uri' ? 'url' : 'text'}
              value={String(value || '')}
              onChange={(e) => handleChange(key, e.target.value)}
              minLength={propSchema.minLength}
              maxLength={propSchema.maxLength}
              className={inputClasses}
            />
            {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
          </div>
        );
    }
  };

  const propertyKeys = Object.keys(properties);

  if (propertyKeys.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Execute: {tool.name}</h2>
        <p className="text-gray-600 mb-4">This tool has no parameters.</p>
        <button
          onClick={() => onExecute({})}
          disabled={isExecuting}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed transition-colors"
        >
          {isExecuting ? 'Executing...' : 'Execute'}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">Execute: {tool.name}</h2>
      
      <form onSubmit={handleSubmit}>
        {propertyKeys.map((key) => renderField(key, properties[key]))}
        
        <button
          type="submit"
          disabled={isExecuting}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed transition-colors"
        >
          {isExecuting ? 'Executing...' : 'Execute'}
        </button>
      </form>
    </div>
  );
}
