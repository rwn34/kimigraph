import { describe, it, expect } from 'vitest';
import { extractFromSource } from '../src/extraction';

describe('Protobuf extraction', () => {
  it('extracts messages, services, and RPCs', async () => {
    const proto = `
syntax = "proto3";

package example;

message User {
  string name = 1;
  int32 age = 2;
}

enum Status {
  ACTIVE = 0;
  INACTIVE = 1;
}

service UserService {
  rpc GetUser(GetUserRequest) returns (User);
  rpc CreateUser(User) returns (User);
}
`;
    const result = await extractFromSource('example.proto', proto);

    const messages = result.nodes.filter((n) => n.kind === 'class' && n.name !== 'UserService');
    expect(messages.some((n) => n.name === 'User')).toBe(true);

    const enums = result.nodes.filter((n) => n.kind === 'enum');
    expect(enums.some((n) => n.name === 'Status')).toBe(true);

    const services = result.nodes.filter((n) => n.kind === 'class' && n.name === 'UserService');
    expect(services.length).toBe(1);

    const rpcs = result.nodes.filter((n) => n.kind === 'method');
    expect(rpcs.length).toBe(2);
    expect(rpcs.some((n) => n.name === 'GetUser')).toBe(true);
    expect(rpcs.some((n) => n.name === 'CreateUser')).toBe(true);

    const getUser = rpcs.find((n) => n.name === 'GetUser');
    expect(getUser?.signature).toBe('(GetUserRequest) -> User');
  });
});
