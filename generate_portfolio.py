import re
import datetime # Import datetime module
from jinja2 import Environment, FileSystemLoader

def parse_markdown(md_file):
    with open(md_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    portfolio_data = {
        "hero_title": "",
        "hero_subtitle": "",
        "sections": []
    }
    current_section = None
    current_card = None

    lines_iter = iter(lines)
    line = next(lines_iter, None)

    # Parse Hero section
    if line and line.startswith('# '):
        portfolio_data["hero_title"] = line[2:].strip()
        line = next(lines_iter, None)
        # Check if the next line is the subtitle (not a separator, section header, or id)
        if line and not line.startswith('---') and not line.startswith('## ') and not line.startswith('id:'):
            portfolio_data["hero_subtitle"] = line.strip()
            line = next(lines_iter, None) # Move to the next line after subtitle

    # Parse Sections and Cards
    while line is not None:
        line = line.strip()

        if line.startswith('---'):
            # Finalize the previous card and section before starting anew
            if current_card and current_section:
                current_section["cards"].append(current_card)
                current_card = None
            if current_section:
                portfolio_data["sections"].append(current_section)
                current_section = None
            line = next(lines_iter, None)
            continue

        if line.startswith('id:'):
            section_id = line.split(':', 1)[1].strip()
            # If a section was already started (e.g., by ##), finalize it
            if current_section:
                 if current_card:
                    current_section["cards"].append(current_card)
                    current_card = None
                 portfolio_data["sections"].append(current_section)
            # Start a new section with this id
            current_section = {"id": section_id, "title": "", "cards": []}
            line = next(lines_iter, None)
            continue

        if line.startswith('## '):
            # Finalize the previous card
            if current_card and current_section:
                current_section["cards"].append(current_card)
                current_card = None
            section_title = line[3:].strip()
            # If section already started by id, just set title
            if current_section and not current_section["title"]:
                 current_section["title"] = section_title
            else: # Otherwise, finalize previous section (if any) and start new one
                if current_section:
                    portfolio_data["sections"].append(current_section)
                # Generate an id from title if not provided via 'id:'
                section_id = section_title.lower().replace(' ', '-')
                current_section = {"id": section_id, "title": section_title, "cards": []}
            line = next(lines_iter, None)
            continue

        if line.startswith('### '):
            # Finalize the previous card before starting a new one within the same section
            if current_card and current_section:
                current_section["cards"].append(current_card)
            # Start a new card object
            current_card = {"title": line[4:].strip(), "link": "#", "image": None, "description": [], "is_special": False}
            line = next(lines_iter, None)
            continue

        # Ensure we are inside a section and a card before parsing card details
        if current_section and current_card:
            # Parse Card Link in [Text](URL) format
            link_match = re.match(r'^\s*\[([^\]]+)\]\(([^\)]+)\)\s*$', line)
            if link_match:
                # link_text = link_match.group(1) # Not currently used
                link_url = link_match.group(2)
                if link_url != 'link_placeholder':
                     current_card["link"] = link_url
                line = next(lines_iter, None)
                continue

            # Parse Card Image
            img_match = re.match(r'^\s*!\[([^\]]*)\]\(([^\)]+)\)(\{type=special\})?\s*$', line)
            if img_match:
                alt_text = img_match.group(1)
                img_src = img_match.group(2)
                special_flag = img_match.group(3)
                current_card["image"] = {"src": img_src, "alt": alt_text}
                if special_flag:
                    current_card["is_special"] = True
                line = next(lines_iter, None)
                continue

            # Parse plain URL if link is not set yet
            if current_card["link"] == "#": # Only if link hasn't been set by [Text](URL)
                url_match = re.match(r'^\s*(https?://\S+)\s*$', line)
                if url_match:
                    current_card["link"] = url_match.group(1)
                    line = next(lines_iter, None)
                    continue

            # Parse Card Description (if it's not empty and not any special format)
            if line:
                current_card["description"].append(line)

        # Move to the next line for the next iteration
        line = next(lines_iter, None)

    # Add the last processed card and section after the loop finishes
    if current_card and current_section:
        current_section["cards"].append(current_card)
    if current_section:
        portfolio_data["sections"].append(current_section)

    return portfolio_data

def render_html(data, template_file, output_file):
    # Ensure the template directory is correctly specified (current directory in this case)
    env = Environment(loader=FileSystemLoader('.'), trim_blocks=True, lstrip_blocks=True)
    template = env.get_template(template_file)

    # Get current year
    current_year = datetime.datetime.now().year

    # Pass the main data and the current year to the template
    render_data = {
        "portfolio_data": data,
        "current_year": current_year
    }
    html_content = template.render(render_data)
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html_content)

if __name__ == "__main__":
    markdown_file = "portforio/portforio.md"
    template_file = "portforio/template.html"
    # Output to a different file initially to avoid accidental overwrites during testing
    output_file = "portforio/portforio_generated.html"

    if not re.match(r'^[\w\.\-\/]+$', markdown_file) or \
       not re.match(r'^[\w\.\-\/]+$', template_file) or \
       not re.match(r'^[\w\.\-\/]+$', output_file):
        print("Error: Invalid file path characters.")
    else:
        try:
            portfolio_data = parse_markdown(markdown_file)
            # import json # Optional: for pretty printing the parsed data
            # print(json.dumps(portfolio_data, indent=2, ensure_ascii=False))
            render_html(portfolio_data, template_file, output_file)
            print(f"Successfully generated {output_file} from {markdown_file} using {template_file}")
        except FileNotFoundError as e:
            print(f"Error: File not found - {e}")
        except Exception as e:
            print(f"An error occurred: {e}") 