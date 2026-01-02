/**
 * Base types that get imported by test-types.ts
 * Used to test cross-file type resolution.
 */

/** A geographic address */
export interface Address {
  street: string;
  city: string;
  zipCode: string;
  country?: string;
}

/** Contact information */
export interface ContactInfo {
  email: string;
  phone?: string;
  address: Address;
}

/** Generic metadata that can be attached to entities */
export interface Metadata {
  /** When the entity was created */
  createdAt: string;
  /** When the entity was last updated */
  updatedAt: string;
  /** Optional tags for categorization */
  tags?: string[];
}

/** Status values for orders */
export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

/** A line item in an order */
export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}
