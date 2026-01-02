/**
 * Test types for ts-schema extraction tests.
 * Imports types from base-types.ts to test cross-file resolution.
 */

import { Address, ContactInfo, Metadata, OrderStatus, OrderItem } from './base-types';

// ============================================================================
// Simple primitives
// ============================================================================

/** A person with basic info */
export interface Person {
  name: string;
  age: number;
  active: boolean;
}

/** Configuration with optional fields */
export interface Config {
  required: string;
  optional?: number;
}

/** Container with array property */
export interface Container {
  items: string[];
}

/** Simple type alias */
export type Status = string;

// ============================================================================
// Documented types (JSDoc extraction)
// ============================================================================

/** A documented entity with JSDoc on properties */
export interface Documented {
  /** The user's unique identifier */
  id: string;
  /** The user's display name */
  name: string;
}

// ============================================================================
// Types using imports from base-types.ts
// ============================================================================

/** A user with imported contact info */
export interface User {
  id: string;
  username: string;
  contact: ContactInfo;
  metadata: Metadata;
}

/** A customer with imported address */
export interface Customer {
  customerId: string;
  name: string;
  email: string;
  billingAddress: Address;
  shippingAddress?: Address;
}

/** An order using imported types */
export interface Order {
  orderId: string;
  customerId: string;
  status: OrderStatus;
  items: OrderItem[];
  totalAmount: number;
  shippingAddress: Address;
  notes?: string;
}

// ============================================================================
// Complex nested types
// ============================================================================

/** Deeply nested structure */
export interface Company {
  name: string;
  headquarters: Address;
  employees: Employee[];
  departments: Department[];
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  contact: ContactInfo;
  manager?: Employee;
}

export interface Department {
  name: string;
  head: Employee;
  budget: number;
}

// ============================================================================
// Array types
// ============================================================================

/** Entity with various array types */
export interface ArrayTypes {
  strings: string[];
  numbers: number[];
  booleans: boolean[];
  nested: Address[];
  matrix: number[][];
}

// ============================================================================
// Union and optional types
// ============================================================================

/** Type with unions */
export interface WithUnions {
  id: string | number;
  status: 'active' | 'inactive' | 'pending';
  data: string | null;
}

/** Type with all optional fields */
export interface AllOptional {
  field1?: string;
  field2?: number;
  field3?: boolean;
}
