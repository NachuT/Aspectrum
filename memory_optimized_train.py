#!/usr/bin/env python3
"""
Memory-optimized training script for Apple Silicon with MPS acceleration
Uses gradient accumulation to simulate larger batch sizes while staying within memory limits
"""

import torch
import torch.nn as nn
import torch.optim as optim
import argparse
import time
import os
import json
from tqdm import tqdm
from colorblindness_correction import ColorCorrectionTrainer, ColorCorrectionNet

class MemoryOptimizedTrainer(ColorCorrectionTrainer):
    """Memory-optimized trainer with gradient accumulation"""
    
    def train_model(self, colorblind_type, data_loaders, epochs=20, lr=0.001, accumulation_steps=4):
        """Train a model with gradient accumulation for memory efficiency"""
        
        print(f"\nTraining model for {colorblind_type} with memory optimization...")
        print(f"Gradient accumulation steps: {accumulation_steps}")
        
        # Create model
        model = ColorCorrectionNet().to(self.device)
        self.models[colorblind_type] = model
        
        # Loss and optimizer - optimized for memory
        criterion = nn.MSELoss()
        optimizer = optim.AdamW(model.parameters(), lr=lr, weight_decay=0.01)
        scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)
        
        # Training history
        train_losses = []
        val_losses = []
        
        best_val_loss = float('inf')
        
        train_loader = data_loaders[colorblind_type]['train']
        val_loader = data_loaders[colorblind_type]['val']
        
        for epoch in range(epochs):
            # Training with gradient accumulation
            model.train()
            train_loss = 0.0
            optimizer.zero_grad()
            
            for batch_idx, batch in enumerate(tqdm(train_loader, desc=f'Epoch {epoch+1}/{epochs}')):
                simulated = batch['simulated'].to(self.device)
                corrected = batch['corrected'].to(self.device)
                
                # Forward pass
                output = model(simulated)
                loss = criterion(output, corrected) / accumulation_steps  # Scale loss
                
                # Backward pass
                loss.backward()
                
                # Update weights every accumulation_steps
                if (batch_idx + 1) % accumulation_steps == 0:
                    optimizer.step()
                    optimizer.zero_grad()
                    
                    # Clear MPS cache periodically
                    if self.device == 'mps' and batch_idx % 10 == 0:
                        torch.mps.empty_cache()
                
                train_loss += loss.item() * accumulation_steps
            
            # Handle remaining gradients
            if len(train_loader) % accumulation_steps != 0:
                optimizer.step()
                optimizer.zero_grad()
            
            # Validation
            model.eval()
            val_loss = 0.0
            
            with torch.no_grad():
                for batch in val_loader:
                    simulated = batch['simulated'].to(self.device)
                    corrected = batch['corrected'].to(self.device)
                    
                    output = model(simulated)
                    loss = criterion(output, corrected)
                    val_loss += loss.item()
                    
                    # Clear MPS cache during validation
                    if self.device == 'mps':
                        torch.mps.empty_cache()
            
            # Calculate average losses
            avg_train_loss = train_loss / len(train_loader)
            avg_val_loss = val_loss / len(val_loader)
            
            train_losses.append(avg_train_loss)
            val_losses.append(avg_val_loss)
            
            # Learning rate scheduling
            scheduler.step()
            
            print(f'Epoch {epoch+1}/{epochs}:')
            print(f'  Train Loss: {avg_train_loss:.6f}')
            print(f'  Val Loss: {avg_val_loss:.6f}')
            print(f'  LR: {optimizer.param_groups[0]["lr"]:.6f}')
            
            # Save best model
            if avg_val_loss < best_val_loss:
                best_val_loss = avg_val_loss
                torch.save(model.state_dict(), self.models_dir / f'{colorblind_type}_best.pth')
                print(f'  New best model saved!')
            
            # Save checkpoint every 5 epochs
            if (epoch + 1) % 5 == 0:
                torch.save(model.state_dict(), self.models_dir / f'{colorblind_type}_epoch_{epoch+1}.pth')
        
        # Save final model
        torch.save(model.state_dict(), self.models_dir / f'{colorblind_type}_final.pth')
        
        # Save training history
        history = {
            'train_losses': train_losses,
            'val_losses': val_losses,
            'best_val_loss': best_val_loss
        }
        
        with open(self.models_dir / f'{colorblind_type}_history.json', 'w') as f:
            json.dump(history, f, indent=2)
        
        print(f'\nTraining completed for {colorblind_type}!')
        print(f'Best validation loss: {best_val_loss:.6f}')
        
        return model, history

def main():
    parser = argparse.ArgumentParser(description='Memory-optimized training for colorblindness correction')
    parser.add_argument('--data_dir', type=str, default='/Users/nachuthenappan/Downloads/data',
                       help='Path to dataset directory')
    parser.add_argument('--batch_size', type=int, default=4,
                       help='Batch size for training (small for memory)')
    parser.add_argument('--epochs', type=int, default=20,
                       help='Number of training epochs')
    parser.add_argument('--lr', type=float, default=0.001,
                       help='Learning rate')
    parser.add_argument('--accumulation_steps', type=int, default=4,
                       help='Gradient accumulation steps (simulates larger batch size)')
    parser.add_argument('--device', type=str, default='auto',
                       help='Device to use (mps, cuda, cpu, or auto)')
    
    args = parser.parse_args()
    
    # Set MPS memory optimization
    if torch.backends.mps.is_available():
        os.environ['PYTORCH_MPS_HIGH_WATERMARK_RATIO'] = '0.0'
        print("🔧 MPS memory optimization enabled")
    
    # Set device
    if args.device == 'auto':
        if torch.backends.mps.is_available():
            device = 'mps'
            print("🚀 Using Apple Metal Performance Shaders (MPS) acceleration!")
        elif torch.cuda.is_available():
            device = 'cuda'
            print("🚀 Using CUDA acceleration!")
        else:
            device = 'cpu'
            print("⚠️  Using CPU (slower)")
    else:
        device = args.device
    
    print(f"Device: {device}")
    print(f"PyTorch version: {torch.__version__}")
    
    # Create trainer
    trainer = MemoryOptimizedTrainer(args.data_dir, device)
    
    # Start timing
    start_time = time.time()
    
    print(f"\n🎯 Memory-Optimized Training Configuration:")
    print(f"   Batch size: {args.batch_size}")
    print(f"   Accumulation steps: {args.accumulation_steps}")
    print(f"   Effective batch size: {args.batch_size * args.accumulation_steps}")
    print(f"   Epochs: {args.epochs}")
    print(f"   Learning rate: {args.lr}")
    print(f"   Image size: 480x480")
    print(f"   Device: {device}")
    
    # Create data loaders
    data_loaders = trainer.create_data_loaders(args.batch_size)
    
    # Train each model
    for colorblind_type in ['deuteranopia', 'protanopia', 'tritanopia']:
        model, history = trainer.train_model(
            colorblind_type, 
            data_loaders, 
            args.epochs, 
            args.lr,
            args.accumulation_steps
        )
    
    # Calculate total time
    total_time = time.time() - start_time
    hours = int(total_time // 3600)
    minutes = int((total_time % 3600) // 60)
    seconds = int(total_time % 60)
    
    print(f"\n🎉 Training completed!")
    print(f"⏱️  Total time: {hours:02d}:{minutes:02d}:{seconds:02d}")
    print(f"📁 Models saved in: models/")
    
    if device == 'mps':
        print(f"🚀 MPS acceleration with memory optimization!")

if __name__ == "__main__":
    main()
