# WebLocker Pro - Website Security Management System

## Overview

WebLocker Pro is a full-stack web application that provides secure website protection through PIN-based access control. The system consists of a React-based dashboard frontend, Express.js backend, and a Chrome extension for browser integration. Users can manage website locks, set time-based restrictions, and monitor activity through a comprehensive dashboard interface.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and optimized production builds
- **Styling**: Tailwind CSS with shadcn/ui component library
- **State Management**: React hooks with local state management
- **Query Management**: TanStack React Query for API interactions
- **Component System**: Radix UI primitives with custom styling

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **Database**: PostgreSQL with Drizzle ORM
- **Database Provider**: Neon Database (serverless PostgreSQL)
- **Session Management**: connect-pg-simple for PostgreSQL session storage
- **Development**: Hot reload with tsx and Vite middleware integration

### Database Schema
The application uses a simple user management system:
- **Users Table**: Stores user credentials with username/password authentication
- **Schema Location**: `shared/schema.ts` defines the database structure
- **ORM**: Drizzle ORM with Zod validation for type-safe database operations

## Key Components

### Authentication System
- Username/password based authentication
- Secure session management using PostgreSQL session store
- Shared user schema between frontend and backend via `shared/` directory

### Storage Layer
- **Interface**: `IStorage` defines CRUD operations for user management
- **Implementation**: `MemStorage` provides in-memory storage for development
- **Database Ready**: Configured for PostgreSQL with connection pooling

### UI Component Library
- **Base**: Radix UI primitives for accessibility and behavior
- **Styling**: Tailwind CSS with CSS variables for theming
- **Components**: Comprehensive set including forms, dialogs, navigation, data display
- **Design System**: Consistent spacing, colors, and typography

### Chrome Extension Integration
The attached assets contain a complete Chrome extension:
- **Manifest V3**: Modern extension architecture
- **Content Scripts**: Website overlay injection
- **Background Service**: Tab monitoring and message handling
- **Popup Interface**: Extension management UI

## Data Flow

### User Authentication Flow
1. User submits credentials through React login form
2. Frontend sends request to Express.js backend API
3. Backend validates credentials against PostgreSQL database
4. Session established and stored in database
5. User redirected to dashboard with authenticated state

### Website Management Flow
1. User adds website URL through dashboard interface
2. Frontend validates and normalizes URL format
3. Backend stores website configuration with user association
4. Chrome extension receives updates via storage sync
5. Content scripts monitor and protect specified websites

### Activity Monitoring
1. Chrome extension logs user interactions and lock events
2. Activity data stored in browser local storage
3. Dashboard displays activity feed with filtering capabilities
4. Users can export or clear activity logs

## External Dependencies

### Frontend Dependencies
- **React Ecosystem**: React, React DOM, React Router (implied)
- **UI Framework**: Radix UI components for accessibility
- **Styling**: Tailwind CSS, class-variance-authority for component variants
- **Forms**: React Hook Form with Zod resolvers for validation
- **Date Handling**: date-fns for date manipulation and formatting
- **Carousel**: Embla Carousel for image/content sliders
- **State Management**: TanStack React Query for server state

### Backend Dependencies
- **Framework**: Express.js with TypeScript support
- **Database**: Drizzle ORM with PostgreSQL adapter
- **Validation**: Zod for runtime type checking
- **Session**: connect-pg-simple for PostgreSQL session storage
- **Development**: tsx for TypeScript execution, esbuild for bundling

### Browser Extension
- **Chrome APIs**: Storage, Tabs, ActiveTab, Scripting permissions
- **Content Security**: Manifest V3 service worker architecture
- **Cross-Origin**: CORS handling for API communication

## Deployment Strategy

### Development Environment
- **Platform**: Replit with Node.js 20 runtime
- **Database**: PostgreSQL 16 module enabled
- **Build Process**: Vite development server with hot module replacement
- **Port Configuration**: Server runs on port 5000 with external access

### Production Build
- **Frontend**: Vite builds optimized static assets to `dist/public`
- **Backend**: esbuild bundles server code to `dist/index.js`
- **Database**: Drizzle migrations applied via `npm run db:push`
- **Deployment**: Autoscale deployment target with proper build/start commands

### Environment Configuration
- **Database URL**: Required environment variable for PostgreSQL connection
- **CORS**: Configured for cross-origin requests from extension
- **Static Files**: Express serves built frontend from public directory

## Changelog

Changelog:
- June 17, 2025. Initial setup

## User Preferences

Preferred communication style: Simple, everyday language.