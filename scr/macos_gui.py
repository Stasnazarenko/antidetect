#!/usr/bin/env python3
"""
🚀 Antidetect Browser Manager - Native macOS App
Замість Electron - простий нативний GUI для macOS

pip install PyQt6
python3 scr/macos_gui.py
"""

import sys
import json
import subprocess
from pathlib import Path
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QTableWidget, QTableWidgetItem, QPushButton, QDialog, QLabel,
    QLineEdit, QComboBox, QMessageBox, QHeaderView
)
from PyQt6.QtCore import Qt, QTimer, QThread, pyqtSignal
from PyQt6.QtGui import QColor, QFont

DB_FILE = Path(__file__).parent.parent / 'storage' / 'profiles.json'

def read_db():
    with open(DB_FILE) as f:
        return json.load(f)

def write_db(data):
    with open(DB_FILE, 'w') as f:
        json.dump(data, f, indent=2)

class BrowserWorker(QThread):
    """Вибітає операції в фоновому потоці"""
    finished = pyqtSignal()
    error = pyqtSignal(str)

    def __init__(self, action, profile_name):
        super().__init__()
        self.action = action
        self.profile_name = profile_name

    def run(self):
        try:
            if self.action == 'open':
                self.open_profile()
            elif self.action == 'close':
                self.close_profile()
            self.finished.emit()
        except Exception as e:
            self.error.emit(str(e))

    def open_profile(self):
        db = read_db()
        profile = next((p for p in db['profiles'] if p['name'] == self.profile_name), None)
        if profile:
            profile['open'] = True
            write_db(db)

    def close_profile(self):
        db = read_db()
        profile = next((p for p in db['profiles'] if p['name'] == self.profile_name), None)
        if profile:
            profile['open'] = False
            write_db(db)

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle('🌐 Antidetect Browser Manager - macOS')
        self.setGeometry(100, 100, 1200, 600)

        # Загальна виглядка
        central = QWidget()
        self.setCentralWidget(central)
        layout = QVBoxLayout(central)

        # Таблиця профілів
        self.table = QTableWidget()
        self.table.setColumnCount(5)
        self.table.setHorizontalHeaderLabels(['Name', 'Status', 'Proxy', 'FP', 'Actions'])
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        layout.addWidget(self.table)

        # Кнопки
        btn_layout = QHBoxLayout()

        self.btn_open = QPushButton('▶️ Open Selected')
        self.btn_open.clicked.connect(self.open_selected)
        btn_layout.addWidget(self.btn_open)

        self.btn_close = QPushButton('⏹️ Close Selected')
        self.btn_close.clicked.connect(self.close_selected)
        btn_layout.addWidget(self.btn_close)

        self.btn_new = QPushButton('➕ New Profile')
        self.btn_new.clicked.connect(self.new_profile)
        btn_layout.addWidget(self.btn_new)

        self.btn_refresh = QPushButton('🔄 Refresh')
        self.btn_refresh.clicked.connect(self.load_profiles)
        btn_layout.addWidget(self.btn_refresh)

        layout.addLayout(btn_layout)

        # Таймер для оновлення
        self.timer = QTimer()
        self.timer.timeout.connect(self.load_profiles)
        self.timer.start(2000)  # Оновлюємо кожні 2 секунди

        self.load_profiles()

    def load_profiles(self):
        try:
            db = read_db()
            self.table.setRowCount(len(db['profiles']))

            for row, profile in enumerate(db['profiles']):
                # Name
                name_item = QTableWidgetItem(profile['name'])
                self.table.setItem(row, 0, name_item)

                # Status
                status = '🟢 OPEN' if profile.get('open') else '⚫ CLOSED'
                status_item = QTableWidgetItem(status)
                if profile.get('open'):
                    status_item.setBackground(QColor(200, 255, 200))
                else:
                    status_item.setBackground(QColor(255, 200, 200))
                self.table.setItem(row, 1, status_item)

                # Proxy
                proxy_item = QTableWidgetItem('✅' if profile.get('proxy') else '❌')
                self.table.setItem(row, 2, proxy_item)

                # Fingerprint
                fp_item = QTableWidgetItem('✅' if profile.get('fingerprint') else '❌')
                self.table.setItem(row, 3, fp_item)

                # Actions
                action_btn = QPushButton('Open' if not profile.get('open') else 'Close')
                action_btn.clicked.connect(
                    lambda checked, p=profile['name']: self.toggle_profile(p)
                )
                self.table.setCellWidget(row, 4, action_btn)

        except Exception as e:
            QMessageBox.critical(self, 'Error', f'Failed to load profiles: {e}')

    def toggle_profile(self, name):
        db = read_db()
        profile = next((p for p in db['profiles'] if p['name'] == name), None)

        if profile:
            action = 'close' if profile.get('open') else 'open'
            self.worker = BrowserWorker(action, name)
            self.worker.finished.connect(self.load_profiles)
            self.worker.error.connect(lambda e: QMessageBox.critical(self, 'Error', e))
            self.worker.start()

    def open_selected(self):
        selected = self.table.selectedIndexes()
        if not selected:
            QMessageBox.warning(self, 'Warning', 'Select profiles first')
            return

        rows = set(idx.row() for idx in selected)
        db = read_db()

        for row in rows:
            if row < len(db['profiles']):
                db['profiles'][row]['open'] = True

        write_db(db)
        self.load_profiles()

    def close_selected(self):
        selected = self.table.selectedIndexes()
        if not selected:
            QMessageBox.warning(self, 'Warning', 'Select profiles first')
            return

        rows = set(idx.row() for idx in selected)
        db = read_db()

        for row in rows:
            if row < len(db['profiles']):
                db['profiles'][row]['open'] = False

        write_db(db)
        self.load_profiles()

    def new_profile(self):
        dialog = QDialog(self)
        dialog.setWindowTitle('Create New Profile')
        dialog.setGeometry(200, 200, 400, 200)

        layout = QVBoxLayout(dialog)

        layout.addWidget(QLabel('Profile name:'))
        name_input = QLineEdit()
        layout.addWidget(name_input)

        btn_create = QPushButton('Create')
        def create():
            name = name_input.text()
            if not name:
                QMessageBox.warning(dialog, 'Warning', 'Enter profile name')
                return

            db = read_db()
            if any(p['name'] == name for p in db['profiles']):
                QMessageBox.warning(dialog, 'Warning', 'Profile already exists')
                return

            db['profiles'].append({
                'name': name,
                'open': False,
                'proxy': False,
                'proxyType': 'http',
                'fingerprint': None,
                'select': ' '
            })
            write_db(db)
            dialog.accept()
            self.load_profiles()

        btn_create.clicked.connect(create)
        layout.addWidget(btn_create)

        dialog.exec()

if __name__ == '__main__':
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())

