import re

with open('contracts/escrow/src/lib.rs', 'r') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if line.strip().startswith('pub struct Escrow') or line.strip().startswith('impl Escrow'):
        print(f"{i+1}: {line.rstrip()}")
