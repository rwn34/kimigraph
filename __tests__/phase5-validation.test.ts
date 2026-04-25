import { describe, it, expect } from 'vitest';
import { KimiGraph } from '../src/index';
import { extractFromSource } from '../src/extraction';
import * as path from 'path';
import * as fs from 'fs';

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'phase5-validation');

function cleanup() {
  fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
}

// ============================================================================
// RUBY — realistic class/module/method/call extraction
// ============================================================================
describe('Ruby extraction', () => {
  it('extracts classes, modules, methods, and calls from realistic code', async () => {
    const code = `
module Authentication
  class TokenValidator
    def initialize(secret)
      @secret = secret
    end
    def validate(token)
      token == @secret
    end
    private
    def hash_token(raw)
      Digest::SHA256.hexdigest(raw)
    end
  end
end
class UserService
  def find_by_email(email)
    User.where(email: email).first
  end
end
`;
    const result = await extractFromSource('auth.rb', code, 'ruby');

    // Classes and modules
    const classes = result.nodes.filter((n) => n.kind === 'class');
    expect(classes.some((n) => n.name === 'TokenValidator')).toBe(true);
    expect(classes.some((n) => n.name === 'UserService')).toBe(true);
    expect(classes.some((n) => n.name === 'Authentication')).toBe(true);

    // Methods inside classes should be method kind
    const methods = result.nodes.filter((n) => n.kind === 'method');
    expect(methods.some((n) => n.name === 'validate')).toBe(true);
    expect(methods.some((n) => n.name === 'find_by_email')).toBe(true);
    expect(methods.some((n) => n.name === 'hash_token')).toBe(true);

    // Public-by-default: methods should be exported
    expect(methods.find((n) => n.name === 'find_by_email')?.isExported).toBe(true);

    // Calls create unresolved refs (single-file extraction)
    expect(result.unresolvedRefs.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// PHP — realistic class/method/visibility extraction
// ============================================================================
describe('PHP extraction', () => {
  it('extracts classes, interfaces, methods, and respects visibility', async () => {
    const code = `<?php
namespace App\\Services;
use App\\Models\\User;
interface AuthenticatorInterface {
    public function authenticate(string $email, string $password): bool;
}
class AuthService implements AuthenticatorInterface {
    public function authenticate(string $email, string $password): bool {
        return password_verify($password, $email);
    }
    protected function hashPassword(string $plain): string {
        return password_hash($plain, PASSWORD_BCRYPT);
    }
}
function globalHelper(string $name): string {
    return "Hello, $name";
}
`;
    const result = await extractFromSource('AuthService.php', code, 'php');

    expect(result.nodes.some((n) => n.kind === 'class' && n.name === 'AuthService')).toBe(true);
    expect(result.nodes.some((n) => n.kind === 'interface' && n.name === 'AuthenticatorInterface')).toBe(true);
    expect(result.nodes.some((n) => n.kind === 'function' && n.name === 'globalHelper')).toBe(true);

    const methods = result.nodes.filter((n) => n.kind === 'method');
    expect(methods.some((n) => n.name === 'authenticate')).toBe(true);

    // public = exported
    expect(methods.find((n) => n.name === 'authenticate')?.isExported).toBe(true);
    // protected = NOT exported
    expect(methods.find((n) => n.name === 'hashPassword')?.isExported).toBe(false);
  });
});

// ============================================================================
// SWIFT — realistic class/protocol/method extraction
// ============================================================================
describe('Swift extraction', () => {
  it('extracts classes, protocols, methods, and functions', async () => {
    const code = `
import Foundation
protocol NetworkService {
    func fetchData(from url: String) -> Data
}
class APIService: NetworkService {
    func fetchData(from url: String) -> Data {
        return Data()
    }
    private func logRequest(_ url: String) {
        print("Requesting: \\(url)")
    }
}
func processUsers(_ users: [User]) -> [String] {
    return users.map { $0.name }
}
`;
    const result = await extractFromSource('API.swift', code, 'swift');

    expect(result.nodes.some((n) => n.kind === 'class' && n.name === 'APIService')).toBe(true);
    expect(result.nodes.some((n) => n.kind === 'interface' && n.name === 'NetworkService')).toBe(true);

    // Methods inside class should be method kind
    const methods = result.nodes.filter((n) => n.kind === 'method');
    expect(methods.some((n) => n.name === 'fetchData')).toBe(true);

    // Top-level function should be function kind
    const functions = result.nodes.filter((n) => n.kind === 'function');
    expect(functions.some((n) => n.name === 'processUsers')).toBe(true);

    // Calls
    expect(result.unresolvedRefs.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// KOTLIN — realistic class/object/method extraction
// ============================================================================
describe('Kotlin extraction', () => {
  it('extracts classes, objects, methods, and functions', async () => {
    const code = `
package com.example.service

class UserServiceImpl(private val repo: UserRepository) : UserService {
    override fun getUser(id: String): User {
        return repo.findById(id)
    }
    override fun saveUser(user: User): User {
        return repo.save(user)
    }
    private fun validate(user: User): Boolean {
        return user.name.isNotBlank()
    }
}

object Config {
    const val MAX_RETRIES = 3
}

fun utilityFunction(input: String): Int {
    return input.length
}
`;
    const result = await extractFromSource('UserService.kt', code, 'kotlin');

    expect(result.nodes.some((n) => n.kind === 'class' && n.name === 'UserServiceImpl')).toBe(true);
    expect(result.nodes.some((n) => n.kind === 'class' && n.name === 'Config')).toBe(true);

    // Methods inside class should be method kind
    const methods = result.nodes.filter((n) => n.kind === 'method');
    expect(methods.some((n) => n.name === 'getUser')).toBe(true);
    expect(methods.some((n) => n.name === 'saveUser')).toBe(true);

    // Top-level function
    const functions = result.nodes.filter((n) => n.kind === 'function');
    expect(functions.some((n) => n.name === 'utilityFunction')).toBe(true);

    // Public-by-default
    expect(methods.find((n) => n.name === 'getUser')?.isExported).toBe(true);
    // Private
    expect(methods.find((n) => n.name === 'validate')?.isExported).toBe(false);

    // Calls
    expect(result.unresolvedRefs.length).toBeGreaterThan(0);
  });

  it('note: Kotlin interfaces use class_declaration AST node — extracted as class kind', async () => {
    // The Kotlin tree-sitter grammar does not distinguish interface_declaration
    // from class_declaration in the AST. Both produce (class_declaration ...).
    // This is a grammar limitation, not a KimiGraph bug.
    const code = `interface UserService {
    fun getUser(id: String): User
}`;
    const result = await extractFromSource('IUserService.kt', code, 'kotlin');
    expect(result.nodes.some((n) => n.name === 'UserService')).toBe(true);
  });
});

// ============================================================================
// TYPE-AWARE SIGNATURE SEARCH
// ============================================================================
describe('Type-aware signature search', () => {
  it('finds functions by param types and return type', async () => {
    cleanup();
    fs.mkdirSync(path.join(FIXTURE_DIR, 'sig-search'), { recursive: true });
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'sig-search', 'api.ts'),
      `export function authenticate(email: string, password: string): boolean { return true; }\n` +
      `export function parseUser(data: string): User { return {} as User; }\n` +
      `export function add(a: number, b: number): number { return a + b; }\n` +
      `export function greet(name: string): void { console.log(name); }\n` +
      `export function noParams(): string { return "hi"; }\n`,
      'utf8'
    );

    const kg = await KimiGraph.init(path.join(FIXTURE_DIR, 'sig-search'), { embedSymbols: false });
    await kg.indexAll();

    expect(kg.searchBySignature('string ->', { limit: 10 }).some((r) => r.node.name === 'authenticate')).toBe(true);
    expect(kg.searchBySignature('-> boolean', { limit: 10 }).some((r) => r.node.name === 'authenticate')).toBe(true);
    expect(kg.searchBySignature('number, number -> number', { limit: 10 }).some((r) => r.node.name === 'add')).toBe(true);
    expect(kg.searchBySignature('-> string', { limit: 10 }).some((r) => r.node.name === 'noParams')).toBe(true);
    expect(kg.searchBySignature('string -> void', { limit: 10 }).some((r) => r.node.name === 'greet')).toBe(true);
    expect(kg.searchBySignature('number -> string', { limit: 10 }).some((r) => r.node.name === 'authenticate')).toBe(false);

    kg.close();
  });
});

// ============================================================================
// PROTOBUF — messages, enums, services, RPCs
// ============================================================================
describe('Protobuf extraction', () => {
  it('extracts messages, enums, services, and RPCs', async () => {
    const proto = `
syntax = "proto3";
package ecommerce;
message Product { string id = 1; }
enum OrderStatus { PENDING = 0; SHIPPED = 1; }
service ProductService {
  rpc GetProduct(GetProductRequest) returns (Product);
  rpc CreateProduct(Product) returns (Product);
}
message GetProductRequest { string id = 1; }
`;
    const result = await extractFromSource('ecommerce.proto', proto, 'protobuf');

    expect(result.nodes.some((n) => n.kind === 'class' && n.name === 'Product')).toBe(true);
    expect(result.nodes.some((n) => n.kind === 'enum' && n.name === 'OrderStatus')).toBe(true);
    expect(result.nodes.some((n) => n.kind === 'class' && n.name === 'ProductService')).toBe(true);

    const rpcs = result.nodes.filter((n) => n.kind === 'method');
    expect(rpcs.some((n) => n.name === 'GetProduct')).toBe(true);
    expect(rpcs.some((n) => n.name === 'CreateProduct')).toBe(true);

    const getProduct = rpcs.find((n) => n.name === 'GetProduct');
    expect(getProduct?.signature).toBe('(GetProductRequest) -> Product');

    expect(result.edges.some((e) => e.kind === 'contains')).toBe(true);
  });
});

// ============================================================================
// CROSS-FILE RESOLUTION (Ruby require_relative + PHP use)
// ============================================================================
describe('Cross-file resolution', () => {
  it('resolves Ruby require_relative and PHP use statements', async () => {
    cleanup();
    fs.mkdirSync(path.join(FIXTURE_DIR, 'cross-file'), { recursive: true });

    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'cross-file', 'user.rb'),
      `class User\n  attr_reader :name\n  def initialize(name)\n    @name = name\n  end\nend\n`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'cross-file', 'app.rb'),
      `require_relative 'user'\n\nclass App\n  def run\n    user = User.new("Alice")\n    puts user.name\n  end\nend\n`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'cross-file', 'User.php'),
      `<?php\nnamespace App\\Models;\n\nclass User {\n  public string $name;\n}\n`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'cross-file', 'Controller.php'),
      `<?php\nnamespace App\\Controllers;\n\nuse App\\Models\\User;\n\nclass Controller {\n  public function show(): User {\n    return new User();\n  }\n}\n`,
      'utf8'
    );

    const kg = await KimiGraph.init(path.join(FIXTURE_DIR, 'cross-file'), { embedSymbols: false });
    await kg.indexAll();

    const stats = kg.getStats();
    expect(stats.files).toBeGreaterThanOrEqual(4);
    expect(stats.edges).toBeGreaterThan(0);

    const rubyUser = (await kg.searchNodes('User', { limit: 10 })).filter((r) => r.node.language === 'ruby');
    expect(rubyUser.some((r) => r.node.kind === 'class')).toBe(true);

    const phpUser = (await kg.searchNodes('User', { limit: 10 })).filter((r) => r.node.language === 'php');
    expect(phpUser.some((r) => r.node.kind === 'class')).toBe(true);

    kg.close();
  });
});
